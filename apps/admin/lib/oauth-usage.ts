import { asc, count, countDistinct, gte, max } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { oauthAccessToken, oauthClient, oauthConsent } from "@ostiary/core/db/schema";

export type OAuthClientUsage = {
  clientId: string;
  name: string | null;
  disabled: boolean;
  tokens30d: number;
  users30d: number;
  consents: number;
  lastTokenAt: Date | null;
};

/** Per-client token activity over the last 30 days, plus consents and last use. */
export async function getOAuthClientUsage(): Promise<OAuthClientUsage[]> {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const [clients, recent, lastUse, consents] = await Promise.all([
    db.select({ clientId: oauthClient.clientId, name: oauthClient.name, disabled: oauthClient.disabled }).from(oauthClient).orderBy(asc(oauthClient.name)),
    db
      .select({ clientId: oauthAccessToken.clientId, tokens: count(), users: countDistinct(oauthAccessToken.userId) })
      .from(oauthAccessToken)
      .where(gte(oauthAccessToken.createdAt, since))
      .groupBy(oauthAccessToken.clientId),
    db.select({ clientId: oauthAccessToken.clientId, last: max(oauthAccessToken.createdAt) }).from(oauthAccessToken).groupBy(oauthAccessToken.clientId),
    db.select({ clientId: oauthConsent.clientId, n: count() }).from(oauthConsent).groupBy(oauthConsent.clientId),
  ]);
  const recentBy = new Map(recent.map((r) => [r.clientId, r]));
  const lastBy = new Map(lastUse.map((r) => [r.clientId, r.last]));
  const consentsBy = new Map(consents.map((r) => [r.clientId, r.n]));
  return clients
    .map((c) => ({
      clientId: c.clientId,
      name: c.name,
      disabled: Boolean(c.disabled),
      tokens30d: recentBy.get(c.clientId)?.tokens ?? 0,
      users30d: recentBy.get(c.clientId)?.users ?? 0,
      consents: consentsBy.get(c.clientId) ?? 0,
      lastTokenAt: lastBy.get(c.clientId) ?? null,
    }))
    .sort((a, b) => b.tokens30d - a.tokens30d);
}
