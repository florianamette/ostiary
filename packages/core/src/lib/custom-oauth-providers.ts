import { genericOAuth } from "better-auth/plugins/generic-oauth";

import { getPinned } from "@ostiary/core/lib/webhooks/transport";
import { checkWebhookUrl } from "@ostiary/core/lib/webhooks/url-safety";
import { webhooksAllowLocalhost } from "@ostiary/core/lib/webhooks/outbox";

/*
 * Custom sign-in providers: any OpenID Connect provider (Keycloak, Okta, Authentik, a company's
 * own), added from the admin console. They are rows of `social_provider` like the built-in
 * ones, with an id `oidc-<slug>`, and Better Auth's generic-oauth plugin builds them: its
 * builder, run per row, gives the same provider object it would add at start-up, used by
 * /sign-in/social and /callback/:id. See social-providers.ts for how they reach Better Auth.
 *
 * The discovery URL is typed by an admin and fetched on the server, so before Better Auth
 * fetches it Ostiary checks it the way it checks webhook URLs (url-safety.ts): https, public
 * addresses only, and so are the endpoints it lists. Better Auth then fetches it again itself,
 * without that pinning: a host that changes its DNS answer between the two would get past the
 * check, as it would for any admin-configured URL a library fetches.
 */

export const CUSTOM_PROVIDER_PREFIX = "oidc-";
/** The part after the prefix: shown in the callback URL, so short and URL-safe. */
export const CUSTOM_PROVIDER_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
export const DEFAULT_CUSTOM_SCOPES = "openid email profile";

export function isCustomProviderId(id: string): boolean {
  return id.startsWith(CUSTOM_PROVIDER_PREFIX) && CUSTOM_PROVIDER_SLUG.test(id.slice(CUSTOM_PROVIDER_PREFIX.length));
}

/** A provider's settings: `config` (plain, in the row) and the client secret (sealed). */
export type CustomProviderConfig = {
  /** The button label: "Continue with <name>". */
  name: string;
  discoveryUrl: string;
  clientId: string;
  /** Space-separated. */
  scopes: string;
};

const DISCOVERY_TIMEOUT_MS = 10_000;
const MAX_DISCOVERY_BYTES = 100_000;

export type DiscoveryCheck = { ok: true } | { ok: false; error: string };

/**
 * Fetches the discovery document through the webhook URL guard and checks that it describes
 * an OpenID Connect provider whose endpoints are https on public addresses.
 */
export async function checkDiscovery(discoveryUrl: string, allowLocalhost = webhooksAllowLocalhost()): Promise<DiscoveryCheck> {
  const check = await checkWebhookUrl(discoveryUrl, allowLocalhost);
  if (!check.ok) return { ok: false, error: `Discovery URL: ${check.error}` };
  const result = await getPinned(check.url, check.addresses, { accept: "application/json", "user-agent": "Ostiary-OIDC-Discovery/1.0" }, {
    maxBytes: MAX_DISCOVERY_BYTES,
    timeoutMs: DISCOVERY_TIMEOUT_MS,
  });
  if (!result.ok) return { ok: false, error: `Could not fetch the discovery document: ${result.error}` };
  if (result.status !== 200 || result.truncated) {
    return { ok: false, error: `The discovery URL answered ${result.status}${result.truncated ? " (too large)" : ""}.` };
  }
  let document: Record<string, unknown>;
  try {
    document = JSON.parse(result.body.toString("utf8")) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "The discovery document is not JSON." };
  }
  const required = ["issuer", "authorization_endpoint", "token_endpoint", "jwks_uri"] as const;
  const missing = required.filter((key) => typeof document[key] !== "string" || !document[key]);
  if (missing.length) return { ok: false, error: `The discovery document has no ${missing.join(", ")}: it must be an OpenID Connect provider.` };
  const endpoints = ["authorization_endpoint", "token_endpoint", "jwks_uri", "userinfo_endpoint"] as const;
  for (const key of endpoints) {
    const value = document[key];
    if (value === undefined) continue;
    if (typeof value !== "string") return { ok: false, error: `${key} in the discovery document is not a URL.` };
    // The browser goes to the authorization endpoint; Ostiary's server calls the others.
    const endpoint = key === "authorization_endpoint" ? null : await checkWebhookUrl(value, allowLocalhost);
    if (endpoint && !endpoint.ok) return { ok: false, error: `${key}: ${endpoint.error}` };
    if (key === "authorization_endpoint" && !/^https:\/\//.test(value) && !allowLocalhost) {
      return { ok: false, error: "authorization_endpoint must use https://." };
    }
  }
  return { ok: true };
}

/** What `social-providers.ts` needs of a provider object. */
export type CustomProviderInstance = { id: string; name: string; disableImplicitSignUp?: boolean };

type BuildContext = {
  baseURL: string;
  logger: { error: (message: string) => void; warn: (message: string) => void };
};

/**
 * Builds the provider with Better Auth's generic-oauth plugin: discovery, ID tokens verified
 * against the provider's JWKS and issuer, PKCE. Null when discovery fails (logged by Better
 * Auth); the next reload tries again.
 */
export async function buildCustomProvider(
  id: string,
  config: CustomProviderConfig,
  clientSecret: string | undefined,
  { allowSignUp }: { allowSignUp: boolean },
  context: BuildContext,
): Promise<CustomProviderInstance | null> {
  const plugin = genericOAuth({
    config: [
      {
        providerId: id,
        name: config.name,
        discoveryUrl: config.discoveryUrl,
        clientId: config.clientId,
        clientSecret: clientSecret || undefined,
        scopes: config.scopes.split(/\s+/).filter(Boolean),
        pkce: true,
        requireIdTokenVerification: true,
        disableImplicitSignUp: !allowSignUp,
      },
    ],
  });
  const init = plugin.init as unknown as (ctx: unknown) => Promise<{ context: { socialProviders: CustomProviderInstance[] } }>;
  const { context: built } = await init({ ...context, socialProviders: [] });
  const provider = built.socialProviders.find((p) => p.id === id) ?? null;
  // As Better Auth does at startup (context/create-context).
  if (provider) provider.disableImplicitSignUp = !allowSignUp;
  return provider;
}
