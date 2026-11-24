import { createHash, randomUUID } from "node:crypto";
import { and, asc, count, eq } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { member, organizationRole, team, teamMember, user } from "@ostiary/core/db/schema";
import {
  BUILT_IN_ORGANIZATION_ROLES,
  CUSTOM_ROLE_NAME,
  normalizeRolePermissions,
  parseRolePermissions,
  type RolePermissions,
} from "@ostiary/core/lib/organization-access";

/*
 * An organization's custom roles and teams, managed from the admin console. Platform admins are
 * usually not members, and Better Auth's endpoints for these require a member with the right
 * role, so this writes the same rows Better Auth does (organization_role, team, team_member,
 * with Better Auth's membership key and the team's member count).
 */

/** Better Auth's team membership key (organization/adapter.ts): SHA-256 of [teamId, userId]. */
export function teamMembershipKey(teamId: string, userId: string): string {
  return createHash("sha256").update(JSON.stringify([teamId, userId])).digest("base64url");
}

export type Refusal = { ok: false; code: "invalidName" | "reservedName" | "nameTaken" | "invalidPermissions" | "roleInUse" | "notFound" | "notMember" | "alreadyInTeam" | "invalidTeamName" };
type Done<T = object> = ({ ok: true } & T) | Refusal;

export type OrganizationRoleRow = { id: string; role: string; permissions: RolePermissions; members: number };

export async function listOrganizationRoles(organizationId: string): Promise<OrganizationRoleRow[]> {
  const rows = await db
    .select()
    .from(organizationRole)
    .where(eq(organizationRole.organizationId, organizationId))
    .orderBy(asc(organizationRole.role));
  const counts = await db
    .select({ role: member.role, n: count() })
    .from(member)
    .where(eq(member.organizationId, organizationId))
    .groupBy(member.role);
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    permissions: parseRolePermissions(row.permission),
    members: counts.find((c) => c.role === row.role)?.n ?? 0,
  }));
}

/** The roles a member can be given: the built-in ones, then the organization's own. */
export async function organizationRoleNames(organizationId: string): Promise<string[]> {
  const custom = await db
    .select({ role: organizationRole.role })
    .from(organizationRole)
    .where(eq(organizationRole.organizationId, organizationId))
    .orderBy(asc(organizationRole.role));
  return [...BUILT_IN_ORGANIZATION_ROLES, ...custom.map((r) => r.role)];
}

export async function createOrganizationRole(organizationId: string, name: string, permissions: unknown): Promise<Done<{ id: string }>> {
  const role = name.trim().toLowerCase();
  if (!CUSTOM_ROLE_NAME.test(role)) return { ok: false, code: "invalidName" };
  if ((BUILT_IN_ORGANIZATION_ROLES as readonly string[]).includes(role)) return { ok: false, code: "reservedName" };
  const normalized = normalizeRolePermissions(permissions);
  if (!normalized) return { ok: false, code: "invalidPermissions" };
  const [taken] = await db
    .select({ id: organizationRole.id })
    .from(organizationRole)
    .where(and(eq(organizationRole.organizationId, organizationId), eq(organizationRole.role, role)));
  if (taken) return { ok: false, code: "nameTaken" };
  const id = randomUUID();
  await db.insert(organizationRole).values({ id, organizationId, role, permission: JSON.stringify(normalized), createdAt: new Date() });
  return { ok: true, id };
}

export async function updateOrganizationRole(organizationId: string, roleId: string, permissions: unknown): Promise<Done> {
  const normalized = normalizeRolePermissions(permissions);
  if (!normalized) return { ok: false, code: "invalidPermissions" };
  const updated = await db
    .update(organizationRole)
    .set({ permission: JSON.stringify(normalized), updatedAt: new Date() })
    .where(and(eq(organizationRole.id, roleId), eq(organizationRole.organizationId, organizationId)))
    .returning({ id: organizationRole.id });
  return updated.length ? { ok: true } : { ok: false, code: "notFound" };
}

/** Deletes a custom role nobody holds (give its members another role first). */
export async function deleteOrganizationRole(organizationId: string, roleId: string): Promise<Done<{ role: string }>> {
  const [row] = await db
    .select({ role: organizationRole.role })
    .from(organizationRole)
    .where(and(eq(organizationRole.id, roleId), eq(organizationRole.organizationId, organizationId)));
  if (!row) return { ok: false, code: "notFound" };
  const [held] = await db
    .select({ n: count() })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.role, row.role)));
  if ((held?.n ?? 0) > 0) return { ok: false, code: "roleInUse" };
  await db.delete(organizationRole).where(eq(organizationRole.id, roleId));
  return { ok: true, role: row.role };
}

export type TeamRow = { id: string; name: string; members: { userId: string; name: string; email: string }[] };

export async function listTeams(organizationId: string): Promise<TeamRow[]> {
  const teams = await db.select().from(team).where(eq(team.organizationId, organizationId)).orderBy(asc(team.name));
  const members = await db
    .select({ teamId: teamMember.teamId, userId: teamMember.userId, name: user.name, email: user.email })
    .from(teamMember)
    .innerJoin(team, eq(team.id, teamMember.teamId))
    .innerJoin(user, eq(user.id, teamMember.userId))
    .where(eq(team.organizationId, organizationId))
    .orderBy(asc(user.email));
  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    members: members.filter((m) => m.teamId === t.id).map(({ userId, name, email }) => ({ userId, name, email })),
  }));
}

function teamName(raw: string): string | null {
  const name = raw.trim();
  return name && name.length <= 64 ? name : null;
}

export async function createTeam(organizationId: string, rawName: string): Promise<Done<{ id: string }>> {
  const name = teamName(rawName);
  if (!name) return { ok: false, code: "invalidTeamName" };
  const id = randomUUID();
  await db.insert(team).values({ id, name, organizationId, memberCount: 0, createdAt: new Date() });
  return { ok: true, id };
}

export async function renameTeam(organizationId: string, teamId: string, rawName: string): Promise<Done> {
  const name = teamName(rawName);
  if (!name) return { ok: false, code: "invalidTeamName" };
  const updated = await db
    .update(team)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(team.id, teamId), eq(team.organizationId, organizationId)))
    .returning({ id: team.id });
  return updated.length ? { ok: true } : { ok: false, code: "notFound" };
}

export async function deleteTeam(organizationId: string, teamId: string): Promise<Done<{ name: string }>> {
  const deleted = await db
    .delete(team)
    .where(and(eq(team.id, teamId), eq(team.organizationId, organizationId)))
    .returning({ name: team.name });
  return deleted[0] ? { ok: true, name: deleted[0].name } : { ok: false, code: "notFound" };
}

async function syncMemberCount(teamId: string) {
  const [row] = await db.select({ n: count() }).from(teamMember).where(eq(teamMember.teamId, teamId));
  await db.update(team).set({ memberCount: row?.n ?? 0 }).where(eq(team.id, teamId));
}

/** Adds an organization member to one of its teams. */
export async function addTeamMember(organizationId: string, teamId: string, userId: string): Promise<Done> {
  const [found] = await db.select({ id: team.id }).from(team).where(and(eq(team.id, teamId), eq(team.organizationId, organizationId)));
  if (!found) return { ok: false, code: "notFound" };
  const [isMember] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)));
  if (!isMember) return { ok: false, code: "notMember" };
  const inserted = await db
    .insert(teamMember)
    .values({ id: randomUUID(), teamId, userId, membershipKey: teamMembershipKey(teamId, userId), createdAt: new Date() })
    .onConflictDoNothing({ target: teamMember.membershipKey })
    .returning({ id: teamMember.id });
  if (!inserted.length) return { ok: false, code: "alreadyInTeam" };
  await syncMemberCount(teamId);
  return { ok: true };
}

/** Adds the organization member with this email to one of its teams. */
export async function addTeamMemberByEmail(organizationId: string, teamId: string, email: string): Promise<Done<{ userId: string }>> {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .innerJoin(member, and(eq(member.userId, user.id), eq(member.organizationId, organizationId)))
    .where(eq(user.email, email.trim().toLowerCase()));
  if (!row) return { ok: false, code: "notMember" };
  const result = await addTeamMember(organizationId, teamId, row.id);
  return result.ok ? { ok: true, userId: row.id } : result;
}

export async function removeTeamMember(organizationId: string, teamId: string, userId: string): Promise<Done> {
  const [found] = await db.select({ id: team.id }).from(team).where(and(eq(team.id, teamId), eq(team.organizationId, organizationId)));
  if (!found) return { ok: false, code: "notFound" };
  await db.delete(teamMember).where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)));
  await syncMemberCount(teamId);
  return { ok: true };
}
