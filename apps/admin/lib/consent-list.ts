import { and, arrayContains, count, desc, eq, ilike, isNotNull, ne, or, sql, type SQL } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { oauthClient, oauthConsent, user } from "@ostiary/core/db/schema";
import { containsPattern } from "@/components/admin/common/list-params";

export const CONSENT_SCOPE_FILTERS = ["all", "openid", "offline", "with_reference"] as const;
export type ConsentScopeFilter = (typeof CONSENT_SCOPE_FILTERS)[number];

export type ConsentListRow = {
  id: string;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  clientId: string;
  clientName: string | null;
  clientIcon: string | null;
  referenceId: string | null;
  scopes: string[];
  createdAt: Date;
  updatedAt: Date;
};

function scopeCondition(filter: ConsentScopeFilter): SQL | undefined {
  if (filter === "openid") return arrayContains(oauthConsent.scopes, ["openid"]);
  if (filter === "offline") return arrayContains(oauthConsent.scopes, ["offline_access"]);
  if (filter === "with_reference") return and(isNotNull(oauthConsent.referenceId), ne(oauthConsent.referenceId, ""));
  return undefined;
}

/**
 * One page of every consent on the platform (people's grants to OAuth clients), most recently
 * updated first, with the user and the client. Better Auth's `getConsents` only returns the
 * signed-in user's own, so the console reads the table.
 */
export async function listConsents({
  search,
  scope,
  limit,
  offset,
}: {
  search: string;
  scope: ConsentScopeFilter;
  limit: number;
  offset: number;
}): Promise<{ rows: ConsentListRow[]; total: number }> {
  const pattern = search ? containsPattern(search) : null;
  const where = and(
    pattern
      ? or(
          ilike(user.email, pattern),
          ilike(user.name, pattern),
          ilike(oauthClient.name, pattern),
          ilike(oauthConsent.clientId, pattern),
          ilike(oauthConsent.referenceId, pattern),
          sql`array_to_string(${oauthConsent.scopes}, ' ') ilike ${pattern}`,
          eq(oauthConsent.id, search),
        )
      : undefined,
    scopeCondition(scope),
  );
  const base = () =>
    db
      .select({ total: count() })
      .from(oauthConsent)
      .leftJoin(user, eq(user.id, oauthConsent.userId))
      .leftJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
      .where(where);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: oauthConsent.id,
        userId: oauthConsent.userId,
        userEmail: user.email,
        userName: user.name,
        clientId: oauthConsent.clientId,
        clientName: oauthClient.name,
        clientIcon: oauthClient.icon,
        referenceId: oauthConsent.referenceId,
        scopes: oauthConsent.scopes,
        createdAt: oauthConsent.createdAt,
        updatedAt: oauthConsent.updatedAt,
      })
      .from(oauthConsent)
      .leftJoin(user, eq(user.id, oauthConsent.userId))
      .leftJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
      .where(where)
      .orderBy(desc(oauthConsent.updatedAt), desc(oauthConsent.id))
      .limit(limit)
      .offset(offset),
    base(),
  ]);
  return { rows, total };
}
