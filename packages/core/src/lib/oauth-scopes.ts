import { db } from "@ostiary/core/db/index";
import { oauthResource } from "@ostiary/core/db/schema";
import type { OAuthResourceMetadata } from "@ostiary/core/lib/oauth-resource-policy";

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

/** API scopes: OAUTH_API_SCOPES, then the scopes of every enabled API in the database. */
export async function loadApiScopes(): Promise<string[]> {
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
const REFRESH_MS = 60_000;

/**
 * Shared through globalThis: bundlers and loaders may instantiate this module more than once
 * (Next.js server layers, tsx), and an admin change must reset the cache the auth instance reads.
 */
type ScopeCache = { loadedAt: number; inFlight: Promise<string[]> | null; current: string[] };
const cache = ((globalThis as { __ostiaryApiScopes?: ScopeCache }).__ostiaryApiScopes ??= {
  loadedAt: 0,
  inFlight: null,
  current: [...ENV_API_SCOPES],
});

/** Current API scopes, reloaded from the database when the cached list is older than a minute. */
export async function currentApiScopes(): Promise<string[]> {
  if (Date.now() - cache.loadedAt < REFRESH_MS) return cache.current;
  cache.inFlight ??= loadApiScopes()
    .then((scopes) => {
      cache.current = scopes;
      cache.loadedAt = Date.now();
      return scopes;
    })
    .catch((error) => {
      // Keep serving the previous list; retry on the next request.
      console.error("Could not load the API scopes from the database", error);
      return cache.current;
    })
    .finally(() => {
      cache.inFlight = null;
    });
  return cache.inFlight;
}

/** Makes the next `currentApiScopes()` reload from the database (after an admin change). */
export function invalidateApiScopes() {
  cache.loadedAt = 0;
}

/** Writes the current scopes into the oauth-provider plugin's options. */
export async function syncProviderScopes(options: { scopes?: string[] }) {
  const scopes = [...OIDC_SCOPES, ...(await currentApiScopes())];
  if (options.scopes?.join(" ") !== scopes.join(" ")) options.scopes = scopes;
}
