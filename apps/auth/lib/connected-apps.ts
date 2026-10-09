/** The account dashboard's "Connected applications": which apps a user is signed in to. */
import { and, eq, gt, inArray, isNull, max, min } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { oauthAccessToken, oauthClient, oauthConsent, oauthRefreshToken } from "@ostiary/core/db/schema";
import { appIconSource, appSite } from "@ostiary/core/lib/app-icons/site";

export type ConnectedApp = {
  clientId: string;
  name: string;
  /** The app's site (client_uri, else a public https redirect origin), for the link and subtitle. */
  site: { url: string; host: string } | null;
  /** Whether an icon can be looked up (logo or site): the row then asks /api/app-icon/<id>. */
  hasIcon: boolean;
  scopes: string[];
  /** Earliest consent or token: when the user first connected, as far as records go. */
  connectedAt: string | null;
  /** Newest token issued to the app for this user. */
  lastUsedAt: string | null;
};

/**
 * Apps the user has access to: a consent they gave, or a token that still works. First-party
 * clients skip the consent screen, so they leave no consent row and are only found by their
 * tokens; listing consents alone (Better Auth's `getConsents`) would show nothing for them.
 */
export async function listConnectedApps(userId: string): Promise<ConnectedApp[]> {
  const now = new Date();

  const [consents, refreshTokens, accessTokens, accessDates, refreshDates] = await Promise.all([
    db
      .select({ clientId: oauthConsent.clientId, scopes: oauthConsent.scopes, createdAt: oauthConsent.createdAt })
      .from(oauthConsent)
      .where(eq(oauthConsent.userId, userId)),
    db
      .select({ clientId: oauthRefreshToken.clientId, scopes: oauthRefreshToken.scopes })
      .from(oauthRefreshToken)
      .where(
        and(eq(oauthRefreshToken.userId, userId), isNull(oauthRefreshToken.revoked), gt(oauthRefreshToken.expiresAt, now)),
      ),
    db
      .select({ clientId: oauthAccessToken.clientId, scopes: oauthAccessToken.scopes })
      .from(oauthAccessToken)
      .where(
        and(eq(oauthAccessToken.userId, userId), isNull(oauthAccessToken.revoked), gt(oauthAccessToken.expiresAt, now)),
      ),
    // First and last token per app, expired ones included: when it was connected and last used.
    db
      .select({ clientId: oauthAccessToken.clientId, first: min(oauthAccessToken.createdAt), last: max(oauthAccessToken.createdAt) })
      .from(oauthAccessToken)
      .where(eq(oauthAccessToken.userId, userId))
      .groupBy(oauthAccessToken.clientId),
    db
      .select({ clientId: oauthRefreshToken.clientId, first: min(oauthRefreshToken.createdAt), last: max(oauthRefreshToken.createdAt) })
      .from(oauthRefreshToken)
      .where(eq(oauthRefreshToken.userId, userId))
      .groupBy(oauthRefreshToken.clientId),
  ]);

  // A consent states what the user approved; without one, show what the live tokens carry.
  const scopesByClient = new Map<string, Set<string>>();
  for (const consent of consents) scopesByClient.set(consent.clientId, new Set(consent.scopes));
  const consented = new Set(scopesByClient.keys());
  for (const token of [...refreshTokens, ...accessTokens]) {
    if (consented.has(token.clientId)) continue;
    const scopes = scopesByClient.get(token.clientId) ?? new Set<string>();
    for (const scope of token.scopes) scopes.add(scope);
    scopesByClient.set(token.clientId, scopes);
  }
  if (scopesByClient.size === 0) return [];

  const firstSeen = new Map<string, number>();
  const lastSeen = new Map<string, number>();
  const note = (clientId: string, first: Date | null, last: Date | null) => {
    if (first) firstSeen.set(clientId, Math.min(firstSeen.get(clientId) ?? Infinity, first.getTime()));
    if (last) lastSeen.set(clientId, Math.max(lastSeen.get(clientId) ?? -Infinity, last.getTime()));
  };
  for (const consent of consents) note(consent.clientId, consent.createdAt, null);
  for (const row of [...accessDates, ...refreshDates]) note(row.clientId, row.first, row.last);
  const iso = (time: number | undefined) => (time === undefined ? null : new Date(time).toISOString());

  const clients = await db
    .select({
      clientId: oauthClient.clientId,
      name: oauthClient.name,
      uri: oauthClient.uri,
      icon: oauthClient.icon,
      redirectUris: oauthClient.redirectUris,
    })
    .from(oauthClient)
    .where(inArray(oauthClient.clientId, [...scopesByClient.keys()]));

  return clients
    .map((client) => {
      const site = appSite(client);
      return {
        clientId: client.clientId,
        name: client.name || site?.host || client.clientId,
        site: site ? { url: site.url, host: site.host } : null,
        hasIcon: appIconSource(client) !== null,
        scopes: [...(scopesByClient.get(client.clientId) ?? [])],
        connectedAt: iso(firstSeen.get(client.clientId)),
        lastUsedAt: iso(lastSeen.get(client.clientId)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Whether the user may load this app's icon from /api/app-icon: an app they are connected to
 * (as listed above), or one registered by an admin (shown on the consent screen before the
 * user has answered). A self-registered app the user never connected stays hidden, so the
 * route cannot be used to make this server fetch arbitrary sites.
 */
export async function userMaySeeAppIcon(userId: string, clientId: string, adminRegistered: boolean): Promise<boolean> {
  if (adminRegistered) return true;
  const now = new Date();
  const [consent, refresh, access] = await Promise.all([
    db
      .select({ id: oauthConsent.id })
      .from(oauthConsent)
      .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId)))
      .limit(1),
    db
      .select({ id: oauthRefreshToken.id })
      .from(oauthRefreshToken)
      .where(
        and(
          eq(oauthRefreshToken.userId, userId),
          eq(oauthRefreshToken.clientId, clientId),
          isNull(oauthRefreshToken.revoked),
          gt(oauthRefreshToken.expiresAt, now),
        ),
      )
      .limit(1),
    db
      .select({ id: oauthAccessToken.id })
      .from(oauthAccessToken)
      .where(
        and(
          eq(oauthAccessToken.userId, userId),
          eq(oauthAccessToken.clientId, clientId),
          isNull(oauthAccessToken.revoked),
          gt(oauthAccessToken.expiresAt, now),
        ),
      )
      .limit(1),
  ]);
  return consent.length + refresh.length + access.length > 0;
}

/**
 * Disconnects an app: removes the user's consent and revokes their refresh and access tokens
 * for it, so the app can no longer refresh or call UserInfo. JWT access tokens already issued
 * to APIs stay valid until they expire (one hour at most): they are checked offline.
 */
export async function disconnectApp(userId: string, clientId: string): Promise<void> {
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.delete(oauthConsent).where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId)));
    await tx
      .update(oauthRefreshToken)
      .set({ revoked: now })
      .where(and(eq(oauthRefreshToken.userId, userId), eq(oauthRefreshToken.clientId, clientId), isNull(oauthRefreshToken.revoked)));
    await tx
      .update(oauthAccessToken)
      .set({ revoked: now })
      .where(
        and(
          eq(oauthAccessToken.userId, userId),
          eq(oauthAccessToken.clientId, clientId),
          isNull(oauthAccessToken.revoked),
        ),
      );
  });
}
