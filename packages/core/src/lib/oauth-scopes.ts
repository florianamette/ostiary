import { db } from "@ostiary/core/db/index";
import { oauthResource } from "@ostiary/core/db/schema";
import type { OAuthResourceMetadata } from "@ostiary/core/lib/oauth-resource-policy";
import { refreshingCache } from "@ostiary/core/lib/refreshing-cache";

/** Standard OpenID Connect scopes (Better Auth's defaults). */
export const OIDC_SCOPES = ["openid", "profile", "email", "offline_access"] as const;

/**
 * Scopes from OAUTH_API_SCOPES (comma-separated, e.g. "orders:read,orders:write"). Kept for
 * existing deployments: APIs registered from the admin console declare their own scopes.
 */
export const ENV_API_SCOPES: readonly string[] = (process.env.OAUTH_API_SCOPES ?? "")
  .split(",")
  .map((scope) => scope.trim())
  .filter(Boolean);

/** The scopes an API declares, read from its `oauth_resource` row. */
export function resourceScopes(row: {
  allowedScopes: string[] | null;
  metadata: unknown;
}): string[] {
  const declared = (row.metadata as OAuthResourceMetadata | null)?.scopes;
  const scopes = [...(Array.isArray(declared) ? declared : []), ...(row.allowedScopes ?? [])];
  return [...new Set(scopes)].filter(
    (scope) => typeof scope === "string" && !(OIDC_SCOPES as readonly string[]).includes(scope),
  );
}

/**
 * The scopes a token for one API may carry when that API is not restricted to its own
 * (`allowedScopes` is null): the OpenID Connect scopes, the API's own scopes, and scopes no
 * other API declares (such as OAUTH_API_SCOPES). A scope another API declares belongs to that
 * API and is never issued for this audience.
 */
export function unrestrictedApiScopes(
  identifier: string,
  rows: readonly { identifier: string; allowedScopes: string[] | null; metadata: unknown }[],
  envScopes: readonly string[],
): string[] {
  const own = new Set<string>();
  const others = new Set<string>();
  for (const row of rows) {
    for (const scope of resourceScopes(row)) (row.identifier === identifier ? own : others).add(scope);
  }
  const unowned = envScopes.filter((scope) => !others.has(scope));
  return [...new Set([...OIDC_SCOPES, ...own, ...unowned])];
}

/** API scopes: OAUTH_API_SCOPES, then the scopes of every enabled API in the database. */
async function loadApiScopes(): Promise<string[]> {
  const rows = await db
    .select({
      allowedScopes: oauthResource.allowedScopes,
      metadata: oauthResource.metadata,
      disabled: oauthResource.disabled,
    })
    .from(oauthResource);
  const fromDb = rows.filter((row) => !row.disabled).flatMap(resourceScopes);
  return [...new Set([...ENV_API_SCOPES, ...fromDb])];
}

/**
 * Better Auth reads its scope list (`oauthProvider({ scopes })`) once, at startup. APIs
 * registered from the admin console add scopes at runtime, so each instance reloads the list
 * from the database at most once a minute and writes it into the plugin's options, which the
 * endpoints read on every request (discovery, client registration, token issuance).
 */
const scopeCache = refreshingCache({
  globalKey: "__ostiaryApiScopes",
  refreshMs: 60_000,
  initial: [...ENV_API_SCOPES],
  load: loadApiScopes,
  loadError: "Could not load the API scopes from the database",
});

/** Current API scopes, reloaded from the database when the cached list is older than a minute. */
export async function currentApiScopes(): Promise<string[]> {
  return scopeCache.get();
}

/** Makes the next `currentApiScopes()` reload from the database (after an admin change). */
export function invalidateApiScopes() {
  scopeCache.invalidate();
}

/** Writes the current scopes into the oauth-provider plugin's options. */
export async function syncProviderScopes(options: { scopes?: string[] }) {
  const scopes = [...OIDC_SCOPES, ...(await currentApiScopes())];
  if (options.scopes?.join(" ") !== scopes.join(" ")) options.scopes = scopes;
}
