"use server";

import { randomUUID } from "node:crypto";
import { and, count, eq, inArray, ne } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { setOrganizationTwoFactor } from "@ostiary/core/lib/two-factor-policy";
import {
  addTeamMemberByEmail,
  createOrganizationRole,
  createTeam,
  deleteOrganizationRole,
  deleteTeam,
  organizationRoleNames,
  removeTeamMember,
  renameTeam,
  updateOrganizationRole,
  type Refusal,
} from "@ostiary/core/lib/admin/organization-roles-teams";

import { db } from "@ostiary/core/db/index";
import { invitation, member, organization, team, teamMember, user } from "@ostiary/core/db/schema";
import { leavesNoOwner, roleIncludesOwner } from "@ostiary/core/lib/admin/organization-owners";
import { queueOrganizationInviteEmail } from "@ostiary/core/lib/email/queue-organization-invite-email";
import { env } from "@ostiary/core/lib/env";
import { PUBLIC_ORGANIZATION_ID } from "@ostiary/core/lib/organization-public";
import { routing } from "@ostiary/core/i18n/routing";
import { makeEvent, memberSnapshot } from "@ostiary/core/lib/webhooks/events";
import { enqueueWebhookEvents } from "@ostiary/core/lib/webhooks/outbox";
import { adminAction, input } from "@/lib/admin-action";
import type { ActionResult } from "@/lib/action-result";

/*
 * Platform admins usually aren't members of the organizations they manage, and Better Auth's
 * organization endpoints only allow members with the right role. These actions write to the
 * shared database directly, after checking for an admin session, and record each change.
 * Writing past Better Auth's adapter, they also send the membership webhook events themselves.
 */

/** Built-in roles, and the organization's own (organization_role), checked per organization. */
type Role = string;
/** An unknown role gets its own message, so it is checked by the action, not the schema. */
const role = z.string().max(64);

const errors = () => getTranslations("admin.pages.organizations.errors");

async function orgName(id: string) {
  const [row] = await db.select({ name: organization.name }).from(organization).where(eq(organization.id, id));
  return row?.name ?? null;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Locks the organization's row, so two membership changes cannot both remove its last owners. */
async function lockOrganization(tx: Tx, orgId: string) {
  await tx.select({ id: organization.id }).from(organization).where(eq(organization.id, orgId)).for("update");
}

/** Owners of the organization other than `memberId`. */
async function otherOwners(tx: Tx, orgId: string, memberId: string): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(member)
    .where(and(eq(member.organizationId, orgId), ne(member.id, memberId), roleIncludesOwner(member.role)));
  return row?.n ?? 0;
}

async function findMember(tx: Tx, orgId: string, memberId: string) {
  const [row] = await tx
    .select({ email: user.email, member })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(and(eq(member.id, memberId), eq(member.organizationId, orgId)));
  return row ?? null;
}

const renameInput = z.tuple([input.id, input.text, input.text]);

export async function renameOrganization(id: string, name: string, slug: string): Promise<ActionResult> {
  return adminAction(renameInput, [id, name, slug], async ([id, name, slug], { audit }) => {
    const cleanName = name.trim();
    const cleanSlug = slug.trim().toLowerCase().replace(/\s+/g, "-");
    if (!cleanName || !/^[a-z0-9-]+$/.test(cleanSlug)) return { ok: false, error: (await errors())("invalidNameSlug") };
    if (id === PUBLIC_ORGANIZATION_ID && cleanSlug !== "public") return { ok: false, error: (await errors())("publicSlug") };
    const [taken] = await db.select({ id: organization.id }).from(organization).where(and(eq(organization.slug, cleanSlug), ne(organization.id, id)));
    if (taken) return { ok: false, error: (await errors())("slugTaken") };
    const before = await orgName(id);
    await db.update(organization).set({ name: cleanName, slug: cleanSlug }).where(eq(organization.id, id));
    await audit({ action: "organization.update", target: { type: "organization", id, label: cleanName }, metadata: { from: before, name: cleanName, slug: cleanSlug } });
    return { ok: true };
  });
}

const memberRoleInput = z.tuple([input.id, input.id, role]);

/** Changes a member's role. The organization keeps at least one owner. */
export async function updateMemberRole(orgId: string, memberId: string, newRole: Role): Promise<ActionResult> {
  return adminAction(memberRoleInput, [orgId, memberId, newRole], async ([orgId, memberId, newRole], { audit }) => {
    if (!(await organizationRoleNames(orgId)).includes(newRole)) return { ok: false, error: (await errors())("unknownRole") };
    const outcome = await db.transaction(async (tx) => {
      await lockOrganization(tx, orgId);
      const row = await findMember(tx, orgId, memberId);
      if (!row) return "memberNotFound" as const;
      if (leavesNoOwner(row.member.role, newRole, await otherOwners(tx, orgId, memberId))) return "lastOwner" as const;
      await tx.update(member).set({ role: newRole }).where(eq(member.id, memberId));
      if (row.member.role !== newRole) {
        await enqueueWebhookEvents(tx, [
          makeEvent("organization.member.role_changed", {
            member: memberSnapshot({ ...row.member, role: newRole }),
            previousRole: row.member.role,
          }),
        ]);
      }
      return row;
    });
    if (typeof outcome === "string") return { ok: false, error: (await errors())(outcome) };
    await audit({ action: "organization.update_member_role", target: { type: "organization", id: orgId, label: await orgName(orgId) }, metadata: { member: outcome.email, role: newRole } });
    return { ok: true };
  });
}

const removeMemberInput = z.tuple([input.id, input.id]);

/** Removes a member. Not from the Public workspace, and never the last owner. */
export async function removeMember(orgId: string, memberId: string): Promise<ActionResult> {
  return adminAction(removeMemberInput, [orgId, memberId], async ([orgId, memberId], { audit }) => {
    if (orgId === PUBLIC_ORGANIZATION_ID) return { ok: false, error: (await errors())("publicMembers") };
    const outcome = await db.transaction(async (tx) => {
      await lockOrganization(tx, orgId);
      const row = await findMember(tx, orgId, memberId);
      if (!row) return "memberNotFound" as const;
      if (leavesNoOwner(row.member.role, null, await otherOwners(tx, orgId, memberId))) return "lastOwner" as const;
      await tx.delete(member).where(eq(member.id, memberId));
      // Their places in the organization's teams go with the membership (as Better Auth does).
      const teamIds = (await tx.select({ id: team.id }).from(team).where(eq(team.organizationId, orgId))).map((t) => t.id);
      if (teamIds.length) {
        await tx.delete(teamMember).where(and(eq(teamMember.userId, row.member.userId), inArray(teamMember.teamId, teamIds)));
      }
      await enqueueWebhookEvents(tx, [makeEvent("organization.member.removed", { member: memberSnapshot(row.member) })]);
      return row;
    });
    if (typeof outcome === "string") return { ok: false, error: (await errors())(outcome) };
    await audit({ action: "organization.remove_member", target: { type: "organization", id: orgId, label: await orgName(orgId) }, metadata: { member: outcome.email } });
    return { ok: true };
  });
}

const inviteInput = z.tuple([input.id, input.text, role]);

export async function inviteMember(orgId: string, email: string, inviteRole: Role): Promise<ActionResult> {
  return adminAction(inviteInput, [orgId, email, inviteRole], async ([orgId, email, inviteRole], { audit, session }) => {
    const target = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) return { ok: false, error: (await errors())("invalidEmail") };
    if (!(await organizationRoleNames(orgId)).includes(inviteRole)) return { ok: false, error: (await errors())("unknownRole") };
    const name = await orgName(orgId);
    if (!name || orgId === PUBLIC_ORGANIZATION_ID) return { ok: false, error: (await errors())("noInvitations") };
    const [already] = await db
      .select({ id: member.id })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(and(eq(member.organizationId, orgId), eq(user.email, target)));
    if (already) return { ok: false, error: (await errors())("alreadyMember") };

    const id = randomUUID();
    await db.insert(invitation).values({
      id,
      organizationId: orgId,
      email: target,
      role: inviteRole,
      status: "pending",
      inviterId: session.user.id,
      expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
    });
    queueOrganizationInviteEmail({
      to: target,
      inviteUrl: `${env.AUTH_APP_URL}/${routing.defaultLocale}/accept-invitation/${id}`,
      organizationName: name,
      inviterName: session.user.name || "An administrator",
    });
    await audit({ action: "organization.invite", target: { type: "organization", id: orgId, label: name }, metadata: { email: target, role: inviteRole } });
    return { ok: true };
  });
}

const cancelInvitationInput = z.tuple([input.id, input.id]);

export async function cancelInvitation(orgId: string, invitationId: string): Promise<ActionResult> {
  return adminAction(cancelInvitationInput, [orgId, invitationId], async ([orgId, invitationId], { audit }) => {
    const [row] = await db
      .update(invitation)
      .set({ status: "canceled" })
      .where(and(eq(invitation.id, invitationId), eq(invitation.organizationId, orgId), eq(invitation.status, "pending")))
      .returning({ email: invitation.email });
    if (!row) return { ok: false, error: (await errors())("invitationNotFound") };
    await audit({ action: "organization.cancel_invitation", target: { type: "organization", id: orgId, label: await orgName(orgId) }, metadata: { email: row.email } });
    return { ok: true };
  });
}

const twoFactorInput = z.tuple([input.id, z.boolean()]);

/** Requires (or stops requiring) two-factor authentication for the organization's members. */
export async function setOrganizationTwoFactorAction(orgId: string, required: boolean): Promise<ActionResult> {
  return adminAction(twoFactorInput, [orgId, required], async ([orgId, required], { session, audit }) => {
    const name = await orgName(orgId);
    if (name === null) return { ok: false, error: (await errors())("organizationNotFound") };
    await setOrganizationTwoFactor(orgId, required, session.user.id);
    await audit({
      action: "organization.update",
      target: { type: "organization", id: orgId, label: name },
      metadata: { requireTwoFactor: required },
    });
    return { ok: true };
  });
}

// --- Custom roles and teams ------------------------------------------------------------------

const refused = async (result: Refusal) => ({ ok: false as const, error: (await getTranslations("admin.pages.organizations.rolesTeams.errors"))(result.code) });
const target = async (orgId: string) => ({ type: "organization", id: orgId, label: await orgName(orgId) });
const permissions = z.record(z.string().max(64), z.array(z.string().max(64)).max(20));

export async function createRoleAction(orgId: string, name: string, granted: Record<string, string[]>): Promise<ActionResult> {
  return adminAction(z.tuple([input.id, z.string().max(64), permissions]), [orgId, name, granted], async ([orgId, name, granted], { audit }) => {
    if (orgId === PUBLIC_ORGANIZATION_ID) return { ok: false, error: (await errors())("publicMembers") };
    const result = await createOrganizationRole(orgId, name, granted);
    if (!result.ok) return refused(result);
    await audit({ action: "organization.create_role", target: await target(orgId), metadata: { role: name.trim().toLowerCase(), permissions: granted } });
    return { ok: true };
  });
}

export async function updateRoleAction(orgId: string, roleId: string, granted: Record<string, string[]>): Promise<ActionResult> {
  return adminAction(z.tuple([input.id, input.id, permissions]), [orgId, roleId, granted], async ([orgId, roleId, granted], { audit }) => {
    const result = await updateOrganizationRole(orgId, roleId, granted);
    if (!result.ok) return refused(result);
    await audit({ action: "organization.update_role", target: await target(orgId), metadata: { roleId, permissions: granted } });
    return { ok: true };
  });
}

export async function deleteRoleAction(orgId: string, roleId: string): Promise<ActionResult> {
  return adminAction(z.tuple([input.id, input.id]), [orgId, roleId], async ([orgId, roleId], { audit }) => {
    const result = await deleteOrganizationRole(orgId, roleId);
    if (!result.ok) return refused(result);
    await audit({ action: "organization.delete_role", target: await target(orgId), metadata: { role: result.role } });
    return { ok: true };
  });
}

export async function createTeamAction(orgId: string, name: string): Promise<ActionResult> {
  return adminAction(z.tuple([input.id, z.string().max(200)]), [orgId, name], async ([orgId, name], { audit }) => {
    if (orgId === PUBLIC_ORGANIZATION_ID) return { ok: false, error: (await errors())("publicMembers") };
    const result = await createTeam(orgId, name);
    if (!result.ok) return refused(result);
    await audit({ action: "organization.create_team", target: await target(orgId), metadata: { team: name.trim(), teamId: result.id } });
    return { ok: true };
  });
}

export async function renameTeamAction(orgId: string, teamId: string, name: string): Promise<ActionResult> {
  return adminAction(z.tuple([input.id, input.id, z.string().max(200)]), [orgId, teamId, name], async ([orgId, teamId, name], { audit }) => {
    const result = await renameTeam(orgId, teamId, name);
    if (!result.ok) return refused(result);
    await audit({ action: "organization.update_team", target: await target(orgId), metadata: { teamId, team: name.trim() } });
    return { ok: true };
  });
}

export async function deleteTeamAction(orgId: string, teamId: string): Promise<ActionResult> {
  return adminAction(z.tuple([input.id, input.id]), [orgId, teamId], async ([orgId, teamId], { audit }) => {
    const result = await deleteTeam(orgId, teamId);
    if (!result.ok) return refused(result);
    await audit({ action: "organization.delete_team", target: await target(orgId), metadata: { teamId, team: result.name } });
    return { ok: true };
  });
}

export async function addTeamMemberAction(orgId: string, teamId: string, email: string): Promise<ActionResult> {
  return adminAction(z.tuple([input.id, input.id, z.string().max(320)]), [orgId, teamId, email], async ([orgId, teamId, email], { audit }) => {
    const result = await addTeamMemberByEmail(orgId, teamId, email);
    if (!result.ok) return refused(result);
    await audit({ action: "organization.add_team_member", target: await target(orgId), metadata: { teamId, userId: result.userId, email: email.trim().toLowerCase() } });
    return { ok: true };
  });
}

export async function removeTeamMemberAction(orgId: string, teamId: string, userId: string): Promise<ActionResult> {
  return adminAction(z.tuple([input.id, input.id, input.id]), [orgId, teamId, userId], async ([orgId, teamId, userId], { audit }) => {
    const result = await removeTeamMember(orgId, teamId, userId);
    if (!result.ok) return refused(result);
    await audit({ action: "organization.remove_team_member", target: await target(orgId), metadata: { teamId, userId } });
    return { ok: true };
  });
}
