"use server";

import { randomUUID } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { invitation, member, organization, user } from "@ostiary/core/db/schema";
import { queueOrganizationInviteEmail } from "@ostiary/core/lib/email/queue-organization-invite-email";
import { env } from "@ostiary/core/lib/env";
import { PUBLIC_ORGANIZATION_ID } from "@ostiary/core/lib/organization-public";
import { routing } from "@ostiary/core/i18n/routing";
import { makeEvent, memberSnapshot } from "@ostiary/core/lib/webhooks/events";
import { emitWebhookEvents } from "@ostiary/core/lib/webhooks/outbox";
import { adminActor } from "@/lib/admin-audit";

/*
 * Platform admins usually aren't members of the organizations they manage, and Better Auth's
 * organization endpoints only allow members with the right role. These actions write to the
 * shared database directly, after checking for an admin session, and record each change.
 * Writing past Better Auth's adapter, they also send the membership webhook events themselves.
 */

const ROLES = ["owner", "admin", "member"] as const;
type Role = (typeof ROLES)[number];
type Result = { ok: true } | { ok: false; error: string };

async function orgName(id: string) {
  const [row] = await db.select({ name: organization.name }).from(organization).where(eq(organization.id, id));
  return row?.name ?? null;
}

export async function renameOrganization(id: string, name: string, slug: string): Promise<Result> {
  const { audit } = await adminActor();
  const cleanName = name.trim();
  const cleanSlug = slug.trim().toLowerCase().replace(/\s+/g, "-");
  if (!cleanName || !/^[a-z0-9-]+$/.test(cleanSlug)) return { ok: false, error: "Enter a name and a slug made of letters, numbers and dashes." };
  if (id === PUBLIC_ORGANIZATION_ID && cleanSlug !== "public") return { ok: false, error: "The Public workspace keeps the slug \"public\"." };
  const [taken] = await db.select({ id: organization.id }).from(organization).where(and(eq(organization.slug, cleanSlug), ne(organization.id, id)));
  if (taken) return { ok: false, error: "That slug is already used by another organization." };
  const before = await orgName(id);
  await db.update(organization).set({ name: cleanName, slug: cleanSlug }).where(eq(organization.id, id));
  await audit({ action: "organization.update", target: { type: "organization", id, label: cleanName }, metadata: { from: before, name: cleanName, slug: cleanSlug } });
  return { ok: true };
}

export async function updateMemberRole(orgId: string, memberId: string, role: Role): Promise<Result> {
  const { audit } = await adminActor();
  if (!ROLES.includes(role)) return { ok: false, error: "Unknown role." };
  const [row] = await db
    .select({ email: user.email, member })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(and(eq(member.id, memberId), eq(member.organizationId, orgId)));
  if (!row) return { ok: false, error: "Member not found." };
  await db.update(member).set({ role }).where(eq(member.id, memberId));
  if (row.member.role !== role) {
    await emitWebhookEvents([
      makeEvent("organization.member.role_changed", { member: memberSnapshot({ ...row.member, role }), previousRole: row.member.role }),
    ]);
  }
  await audit({ action: "organization.update_member_role", target: { type: "organization", id: orgId, label: await orgName(orgId) }, metadata: { member: row.email, role } });
  return { ok: true };
}

export async function removeMember(orgId: string, memberId: string): Promise<Result> {
  const { audit } = await adminActor();
  if (orgId === PUBLIC_ORGANIZATION_ID) return { ok: false, error: "Every account belongs to the Public workspace." };
  const [row] = await db
    .select({ email: user.email, member })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(and(eq(member.id, memberId), eq(member.organizationId, orgId)));
  if (!row) return { ok: false, error: "Member not found." };
  await db.delete(member).where(eq(member.id, memberId));
  await emitWebhookEvents([makeEvent("organization.member.removed", { member: memberSnapshot(row.member) })]);
  await audit({ action: "organization.remove_member", target: { type: "organization", id: orgId, label: await orgName(orgId) }, metadata: { member: row.email } });
  return { ok: true };
}

export async function inviteMember(orgId: string, email: string, role: Role): Promise<Result> {
  const { audit, session } = await adminActor();
  const target = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) return { ok: false, error: "Enter a valid email address." };
  if (!ROLES.includes(role)) return { ok: false, error: "Unknown role." };
  const name = await orgName(orgId);
  if (!name || orgId === PUBLIC_ORGANIZATION_ID) return { ok: false, error: "This organization does not take invitations." };
  const [already] = await db
    .select({ id: member.id })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(and(eq(member.organizationId, orgId), eq(user.email, target)));
  if (already) return { ok: false, error: "This person is already a member." };

  const id = randomUUID();
  await db.insert(invitation).values({
    id,
    organizationId: orgId,
    email: target,
    role,
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
  await audit({ action: "organization.invite", target: { type: "organization", id: orgId, label: name }, metadata: { email: target, role } });
  return { ok: true };
}

export async function cancelInvitation(orgId: string, invitationId: string): Promise<Result> {
  const { audit } = await adminActor();
  const [row] = await db
    .update(invitation)
    .set({ status: "canceled" })
    .where(and(eq(invitation.id, invitationId), eq(invitation.organizationId, orgId), eq(invitation.status, "pending")))
    .returning({ email: invitation.email });
  if (!row) return { ok: false, error: "Invitation not found." };
  await audit({ action: "organization.cancel_invitation", target: { type: "organization", id: orgId, label: await orgName(orgId) }, metadata: { email: row.email } });
  return { ok: true };
}
