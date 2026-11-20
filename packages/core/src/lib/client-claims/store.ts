import { and, asc, eq } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { member, oauthClientClaims, organization, session } from "@ostiary/core/db/schema";
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

/** The session's active organization and the user's role in it, or null. */
export async function activeOrganizationFor(sessionId: string | undefined, userId: string): Promise<ClaimOrganization | null> {
  if (!sessionId) return null;
  const [row] = await db
    .select({ id: organization.id, slug: organization.slug, role: member.role })
    .from(session)
    .innerJoin(organization, eq(organization.id, session.activeOrganizationId))
    .innerJoin(member, and(eq(member.organizationId, organization.id), eq(member.userId, userId)))
    .where(and(eq(session.id, sessionId), eq(session.userId, userId)))
    .limit(1);
  return row ?? null;
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
