import { db } from "@ostiary/core/db/index";
import { deleteUserApiKeys } from "@ostiary/core/lib/api-keys";
import { recordAudit } from "@ostiary/core/lib/audit";
import { revokeUserOAuthTokens } from "@ostiary/core/lib/security/oauth-token-revocation";

/** Why an account's access to apps is ended. */
export type AccessRevocationReason = "banned" | "scim_deactivated" | "password_reset";

/**
 * Ends what an account's apps and scripts hold once it is banned, deactivated by SCIM or its
 * password is reset: live OAuth access and refresh tokens, and (except on a password reset,
 * after which the person keeps their account) their personal API keys. Sessions are deleted by
 * Better Auth itself. Each kind revoked is written to the audit log. The one place this is done:
 * the ban hook, SCIM deactivation and password reset all call it.
 */
export async function revokeUserAccess(
  user: { id: string; email: string },
  reason: AccessRevocationReason,
  actor: { id: string; email: string } | null,
  ipAddress: string | null,
) {
  const target = { type: "user", id: user.id, label: user.email };
  const tokens = await revokeUserOAuthTokens(db, user.id);
  if (tokens.accessTokens + tokens.refreshTokens > 0) {
    await recordAudit({ actor, action: "oauth_token.revoke_all", target, metadata: { reason, ...tokens }, ipAddress });
  }
  if (reason === "password_reset") return { ...tokens, apiKeys: 0 };
  // Only the person's own keys: their organizations' keys belong to the organizations.
  const apiKeys = await deleteUserApiKeys(user.id);
  if (apiKeys > 0) {
    await recordAudit({ actor, action: "api_key.revoke_all", target, metadata: { reason, keys: apiKeys }, ipAddress });
  }
  return { ...tokens, apiKeys };
}
