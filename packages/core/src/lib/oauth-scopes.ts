/** Standard OpenID Connect scopes (Better Auth's defaults). */
export const OIDC_SCOPES = ["openid", "profile", "email", "offline_access"] as const;

/**
 * Scopes for your own resource servers (APIs), from OAUTH_API_SCOPES
 * (comma-separated, e.g. "orders:read,orders:write"). Machine clients
 * (client_credentials) must be created with explicit API scopes.
 */
export const API_SCOPES: readonly string[] = (process.env.OAUTH_API_SCOPES ?? "")
  .split(",")
  .map((scope) => scope.trim())
  .filter(Boolean);

export const ALL_SCOPES = [...OIDC_SCOPES, ...API_SCOPES];
