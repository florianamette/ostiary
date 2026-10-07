/** The account dashboard's "Connected applications": which apps a user is signed in to. */
import { and, eq, gt, inArray, isNull } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { oauthAccessToken, oauthClient, oauthConsent, oauthRefreshToken } from "@ostiary/core/db/schema";

export type ConnectedApp = {
  clientId: string;
  name: string;
  uri: string | null;
  icon: string | null;
  scopes: string[];
};

/**
 * Apps the user has access to: a consent they gave, or a token that still works. First-party
 * clients skip the consent screen, so they leave no consent row and are only found by their
 * tokens; listing consents alone (Better Auth's `getConsents`) would show nothing for them.
 */
export async function listConnectedApps(userId: string): Promise<ConnectedApp[]> {
  const now = new Date();

  const [consents, refreshTokens, accessTokens] = await Promise.all([
    db
      .select({ clientId: oauthConsent.clientId, scopes: oauthConsent.scopes })
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

  const clients = await db
    .select({ clientId: oauthClient.clientId, name: oauthClient.name, uri: oauthClient.uri, icon: oauthClient.icon })
    .from(oauthClient)
    .where(inArray(oauthClient.clientId, [...scopesByClient.keys()]));

  return clients
    .map((client) => ({
      clientId: client.clientId,
      name: client.name || client.clientId,
      uri: client.uri,
      icon: client.icon,
      scopes: [...(scopesByClient.get(client.clientId) ?? [])],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
