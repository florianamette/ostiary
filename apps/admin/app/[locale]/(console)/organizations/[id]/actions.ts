"use server";

import { randomUUID } from "node:crypto";
import { and, count, eq, ne } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { db } from "@ostiary/core/db/index";
import { invitation, member, organization, user } from "@ostiary/core/db/schema";
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

const ROLES = ["owner", "admin", "member"] as const;
type Role = (typeof ROLES)[number];
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
    if (!(ROLES as readonly string[]).includes(newRole)) return { ok: false, error: (await errors())("unknownRole") };
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
    if (!(ROLES as readonly string[]).includes(inviteRole)) return { ok: false, error: (await errors())("unknownRole") };
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
