import { and, asc, eq } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { BUILT_IN_ORGANIZATION_ROLES, builtInRolePermissions, parseRolePermissions } from "@ostiary/core/lib/organization-access";
import { member, oauthClientClaims, organization, organizationRole, session, team, teamMember } from "@ostiary/core/db/schema";
import {
  CLIENT_CLAIMS_LIMITS,
  validateClientClaims,
  type ClaimOrganization,
  type ClientClaim,
} from "@ostiary/core/lib/client-claims/policy";

/** An application's custom claims, with when they last changed (null: never set). */
export type StoredClientClaims = { claims: ClientClaim[]; updatedAt: string | null };

/**
 * The application's custom claims. The stored value is validated again (a row written by hand
 * or by an older version): an invalid definition adds no claim at all, and is logged.
 */
export async function getClientClaims(clientId: string): Promise<StoredClientClaims> {
  const [row] = await db
    .select({ claims: oauthClientClaims.claims, updatedAt: oauthClientClaims.updatedAt })
    .from(oauthClientClaims)
    .where(eq(oauthClientClaims.clientId, clientId))
    .limit(1);
  if (!row) return { claims: [], updatedAt: null };
  const parsed = validateClientClaims(row.claims);
  if (!parsed.ok) {
    console.error(`Ignoring the custom claims of client ${clientId}: ${parsed.error}`);
    return { claims: [], updatedAt: row.updatedAt.toISOString() };
  }
  return { claims: parsed.value, updatedAt: row.updatedAt.toISOString() };
}

/** Replaces the application's custom claims (already validated); an empty list removes the row. */
export async function saveClientClaims(clientId: string, claims: ClientClaim[], updatedBy: string): Promise<void> {
  if (claims.length === 0) {
    await db.delete(oauthClientClaims).where(eq(oauthClientClaims.clientId, clientId));
    return;
  }
  const now = new Date();
  await db
    .insert(oauthClientClaims)
    .values({ clientId, claims, updatedAt: now, updatedBy })
    .onConflictDoUpdate({ target: oauthClientClaims.clientId, set: { claims, updatedAt: now, updatedBy } });
}

/**
 * The session's active organization and the user's role in it, or null. With `permissions`,
 * the role's permissions (a built-in role's, or the organization's own role's); with `teams`,
 * the user's teams in it.
 */
export async function activeOrganizationFor(
  sessionId: string | undefined,
  userId: string,
  include: { permissions?: boolean; teams?: boolean } = {},
): Promise<ClaimOrganization | null> {
  if (!sessionId) return null;
  const [row] = await db
    .select({ id: organization.id, slug: organization.slug, role: member.role })
    .from(session)
    .innerJoin(organization, eq(organization.id, session.activeOrganizationId))
    .innerJoin(member, and(eq(member.organizationId, organization.id), eq(member.userId, userId)))
    .where(and(eq(session.id, sessionId), eq(session.userId, userId)))
    .limit(1);
  if (!row) return null;
  const out: ClaimOrganization = { ...row };
  if (include.permissions) out.permissions = await rolePermissions(row.id, row.role);
  if (include.teams) {
    out.teams = await db
      .select({ id: team.id, name: team.name })
      .from(teamMember)
      .innerJoin(team, eq(team.id, teamMember.teamId))
      .where(and(eq(team.organizationId, row.id), eq(teamMember.userId, userId)))
      .orderBy(asc(team.name));
  }
  return out;
}

/** A member's permissions: each role of a comma-separated list, built-in or the organization's. */
async function rolePermissions(organizationId: string, roles: string): Promise<Record<string, string[]>> {
  const merged: Record<string, Set<string>> = {};
  for (const name of roles.split(",").map((r) => r.trim()).filter(Boolean)) {
    let granted: Record<string, string[] | undefined>;
    if ((BUILT_IN_ORGANIZATION_ROLES as readonly string[]).includes(name)) {
      granted = builtInRolePermissions(name as (typeof BUILT_IN_ORGANIZATION_ROLES)[number]);
    } else {
      const [custom] = await db
        .select({ permission: organizationRole.permission })
        .from(organizationRole)
        .where(and(eq(organizationRole.organizationId, organizationId), eq(organizationRole.role, name)));
      granted = custom ? parseRolePermissions(custom.permission) : {};
    }
    for (const [resource, actions] of Object.entries(granted)) {
      for (const action of actions ?? []) (merged[resource] ??= new Set()).add(action);
    }
  }
  return Object.fromEntries(Object.entries(merged).map(([resource, actions]) => [resource, [...actions]]));
}

/** The organizations the user belongs to, oldest membership first (at most 50). */
export async function organizationsOf(userId: string): Promise<ClaimOrganization[]> {
  return db
    .select({ id: organization.id, slug: organization.slug, role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt))
    .limit(CLIENT_CLAIMS_LIMITS.maxOrganizations);
}
