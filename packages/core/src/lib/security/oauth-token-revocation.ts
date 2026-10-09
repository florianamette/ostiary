import { and, eq, isNull } from "drizzle-orm";

import { oauthAccessToken, oauthRefreshToken } from "@ostiary/core/db/schema";
import type { Database } from "@ostiary/core/lib/account-data/database";

/**
 * Revokes every live OAuth access and refresh token of an account, as SCIM deactivation does
 * (lib/scim.ts): sessions are deleted elsewhere, but tokens outlive them, so apps would keep
 * access until expiry. Used when an admin bans the account and when its password is reset.
 * JWT access tokens already issued stay valid until they expire (an hour at most); refresh
 * tokens and introspection of opaque tokens stop at once.
 */
export async function revokeUserOAuthTokens(database: Database, userId: string, now: Date = new Date()) {
  const refresh = await database
    .update(oauthRefreshToken)
    .set({ revoked: now })
    .where(and(eq(oauthRefreshToken.userId, userId), isNull(oauthRefreshToken.revoked)))
    .returning({ id: oauthRefreshToken.id });
  const access = await database
    .update(oauthAccessToken)
    .set({ revoked: now })
    .where(and(eq(oauthAccessToken.userId, userId), isNull(oauthAccessToken.revoked)))
    .returning({ id: oauthAccessToken.id });
  return { accessTokens: access.length, refreshTokens: refresh.length };
}
