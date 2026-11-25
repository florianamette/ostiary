import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { createLocalJWKSet, decodeJwt, type JSONWebKeySet, type JWTVerifyGetKey } from "jose";

import { requestPinned } from "@ostiary/core/lib/webhooks/transport";
import { checkWebhookUrl } from "@ostiary/core/lib/webhooks/url-safety";
import { webhooksAllowLocalhost } from "@ostiary/core/lib/webhooks/outbox";

/*
 * Custom sign-in providers: any OpenID Connect provider (Keycloak, Okta, Authentik, a company's
 * own), added from the admin console. They are rows of `social_provider` like the built-in
 * ones, with an id `oidc-<slug>`, and Better Auth's generic-oauth plugin builds them into the
 * provider objects /sign-in/social and /callback/:id use. See social-providers.ts for how they
 * reach Better Auth.
 *
 * Every request Ostiary's server makes to the provider (discovery, token, UserInfo, keys,
 * refresh) goes through the webhook URL guard (url-safety.ts): https, public addresses only,
 * the connection pinned to the addresses checked, no redirect followed. The discovery URL and
 * the endpoints it lists are typed by an admin or served by the provider, and either could
 * point at the private network (SSRF). So the plugin is given the endpoints Ostiary checked
 * instead of the discovery URL (it would fetch that, and later the keys, the token and the
 * UserInfo endpoints, with a plain fetch), with Ostiary's own token and UserInfo requests, and
 * the ID token settings it would have derived from discovery (keys fetched through the guard,
 * issuer, audience, nonce binding) are set on the provider it builds.
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

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 100_000;
/** How long fetched signing keys are used before they are fetched again. */
const JWKS_CACHE_MS = 10 * 60 * 1000;

type GuardedResult<T> = { ok: true; status: number; json: T } | { ok: false; error: string };

/** One request to the provider through the guard, its answer read as JSON. */
async function guardedJson<T = Record<string, unknown>>(
  rawUrl: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
  allowLocalhost = webhooksAllowLocalhost(),
): Promise<GuardedResult<T>> {
  const check = await checkWebhookUrl(rawUrl, allowLocalhost);
  if (!check.ok) return { ok: false, error: check.error };
  const result = await requestPinned(
    check.url,
    check.addresses,
    {
      method: init.method ?? "GET",
      headers: { accept: "application/json", "user-agent": "Ostiary-OIDC/1.0", ...init.headers },
      body: init.body,
    },
    { maxBytes: MAX_RESPONSE_BYTES, timeoutMs: REQUEST_TIMEOUT_MS },
  );
  if (!result.ok) return { ok: false, error: result.error };
  if (result.truncated) return { ok: false, error: "The answer is too large." };
  try {
    return { ok: true, status: result.status, json: JSON.parse(result.body.toString("utf8")) as T };
  } catch {
    return { ok: false, error: `The answer (${result.status}) is not JSON.` };
  }
}

export type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
  end_session_endpoint?: string;
  id_token_signing_alg_values_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
};

export type DiscoveryCheck = { ok: true; discovery: Discovery } | { ok: false; error: string };

/**
 * Fetches the discovery document through the guard and checks that it describes an OpenID
 * Connect provider whose endpoints are https on public addresses.
 */
export async function checkDiscovery(discoveryUrl: string, allowLocalhost = webhooksAllowLocalhost()): Promise<DiscoveryCheck> {
  const fetched = await guardedJson<Record<string, unknown>>(discoveryUrl, {}, allowLocalhost);
  if (!fetched.ok) return { ok: false, error: `Discovery URL: ${fetched.error}` };
  if (fetched.status !== 200) return { ok: false, error: `The discovery URL answered ${fetched.status}.` };
  const document = fetched.json;
  if (!document || typeof document !== "object" || Array.isArray(document)) return { ok: false, error: "The discovery document is not a JSON object." };
  const required = ["issuer", "authorization_endpoint", "token_endpoint", "jwks_uri"] as const;
  const missing = required.filter((key) => typeof document[key] !== "string" || !document[key]);
  if (missing.length) return { ok: false, error: `The discovery document has no ${missing.join(", ")}: it must be an OpenID Connect provider.` };
  const endpoints = ["authorization_endpoint", "token_endpoint", "jwks_uri", "userinfo_endpoint", "end_session_endpoint"] as const;
  for (const key of endpoints) {
    const value = document[key];
    if (value === undefined) continue;
    if (typeof value !== "string") return { ok: false, error: `${key} in the discovery document is not a URL.` };
    // The browser goes to the authorization and end-session endpoints; the server, to the others.
    if (key === "authorization_endpoint" || key === "end_session_endpoint") {
      if (!/^https:\/\//.test(value) && !allowLocalhost) return { ok: false, error: `${key} must use https://.` };
      continue;
    }
    const endpoint = await checkWebhookUrl(value, allowLocalhost);
    if (!endpoint.ok) return { ok: false, error: `${key}: ${endpoint.error}` };
  }
  return { ok: true, discovery: document as unknown as Discovery };
}

/** Signing keys fetched through the guard, cached, fetched again for an unknown key id. */
function guardedJwks(jwksUri: string): JWTVerifyGetKey {
  let cached: { at: number; get: JWTVerifyGetKey } | null = null;
  const load = async () => {
    const fetched = await guardedJson<JSONWebKeySet>(jwksUri);
    if (!fetched.ok || fetched.status !== 200 || !Array.isArray(fetched.json?.keys)) {
      throw new Error(`Could not fetch the provider's signing keys: ${fetched.ok ? fetched.status : fetched.error}`);
    }
    cached = { at: Date.now(), get: createLocalJWKSet(fetched.json) };
    return cached.get;
  };
  return async (header, token) => {
    const fresh = cached && Date.now() - cached.at < JWKS_CACHE_MS ? cached.get : await load();
    try {
      return await fresh(header, token);
    } catch (error) {
      // A rotated key: fetch the set once more.
      if ((error as { code?: string }).code !== "ERR_JWKS_NO_MATCHING_KEY") throw error;
      return (await load())(header, token);
    }
  };
}

type OAuth2Tokens = {
  tokenType?: string;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: Date;
  scopes?: string[];
  idToken?: string;
};

/** The token endpoint's answer, read like Better Auth's own token requests. */
function toTokens(json: Record<string, unknown>): OAuth2Tokens {
  const str = (key: string) => (typeof json[key] === "string" ? (json[key] as string) : undefined);
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : undefined;
  return {
    tokenType: str("token_type"),
    accessToken: str("access_token"),
    refreshToken: str("refresh_token"),
    accessTokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
    scopes: str("scope")?.split(" ").filter(Boolean),
    idToken: str("id_token"),
  };
}

/** A request to the token endpoint, client authenticated as the provider supports. */
async function tokenRequest(discovery: Discovery, clientId: string, clientSecret: string | undefined, params: Record<string, string>): Promise<OAuth2Tokens> {
  const form = new URLSearchParams(params);
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  const basic = clientSecret && (discovery.token_endpoint_auth_methods_supported ?? ["client_secret_basic"]).includes("client_secret_basic");
  if (basic) {
    headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString("base64")}`;
  } else {
    form.set("client_id", clientId);
    if (clientSecret) form.set("client_secret", clientSecret);
  }
  const answer = await guardedJson(discovery.token_endpoint, { method: "POST", headers, body: form.toString() });
  if (!answer.ok) throw new Error(`Token request failed: ${answer.error}`);
  if (answer.status !== 200) throw new Error(`Token request failed: ${answer.status} ${JSON.stringify(answer.json).slice(0, 200)}`);
  return toTokens(answer.json);
}

/** What `social-providers.ts` needs of a provider object. */
export type CustomProviderInstance = { id: string; name: string; disableImplicitSignUp?: boolean };

type BuildContext = {
  baseURL: string;
  logger: { error: (message: string) => void; warn: (message: string) => void };
};

/**
 * Builds the provider with Better Auth's generic-oauth plugin, from a discovery document fetched
 * and checked now. Null when the discovery fails (logged); the next reload tries again.
 */
export async function buildCustomProvider(
  id: string,
  config: CustomProviderConfig,
  clientSecret: string | undefined,
  { allowSignUp }: { allowSignUp: boolean },
  context: BuildContext,
): Promise<CustomProviderInstance | null> {
  const checked = await checkDiscovery(config.discoveryUrl);
  if (!checked.ok) {
    context.logger.error(`Sign-in provider ${id.replace(/[\r\n]/g, "")}: ${checked.error}`);
    return null;
  }
  const { discovery } = checked;
  const scopes = config.scopes.split(/\s+/).filter(Boolean);
  const plugin = genericOAuth({
    config: [
      {
        providerId: id,
        name: config.name,
        // No discoveryUrl: the plugin would fetch it, and the endpoints, without the guard.
        authorizationUrl: discovery.authorization_endpoint,
        tokenUrl: discovery.token_endpoint,
        userInfoUrl: discovery.userinfo_endpoint,
        clientId: config.clientId,
        clientSecret: clientSecret || undefined,
        scopes,
        pkce: true,
        disableImplicitSignUp: !allowSignUp,
        // The code exchange and UserInfo, through the guard.
        getToken: async ({ code, redirectURI, codeVerifier }) =>
          tokenRequest(discovery, config.clientId, clientSecret, {
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectURI,
            ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
          }) as never,
        getUserInfo: async (tokens) => {
          // The ID token was verified (keys, issuer, audience, nonce) before this is called.
          if (!tokens.idToken) return null;
          const claims = decodeJwt(tokens.idToken);
          let profile: Record<string, unknown> = { ...claims };
          if (discovery.userinfo_endpoint && tokens.accessToken) {
            const answer = await guardedJson(discovery.userinfo_endpoint, { headers: { authorization: `Bearer ${tokens.accessToken}` } });
            if (!answer.ok || answer.status !== 200) return null;
            if (answer.json.sub !== claims.sub) return null;
            profile = { ...claims, ...answer.json };
          }
          return {
            ...profile,
            id: profile.sub as string,
            email: profile.email as string | undefined,
            emailVerified: profile.email_verified === true || profile.email_verified === "true",
            name: profile.name as string | undefined,
            image: profile.picture as string | undefined,
          };
        },
        // The account is the provider's `sub`, from the verified ID token.
        accountSubject: ({ tokens, profile }) =>
          (tokens.idToken ? decodeJwt(tokens.idToken).sub : undefined) ?? (profile.sub as string | undefined) ?? "",
      },
    ],
  });
  const init = plugin.init as unknown as (ctx: unknown) => Promise<{ context: { socialProviders: Record<string, unknown>[] } }>;
  const { context: built } = await init({ ...context, socialProviders: [] });
  const provider = built.socialProviders.find((p) => p.id === id) as (CustomProviderInstance & Record<string, unknown>) | undefined;
  if (!provider) return null;
  // What the plugin derives from discovery: ID tokens checked against the provider's keys
  // (fetched through the guard), issuer and client ID, and bound to a nonce.
  provider.issuer = discovery.issuer;
  provider.idToken = {
    jwks: guardedJwks(discovery.jwks_uri),
    issuer: discovery.issuer,
    audience: config.clientId,
    algorithms: discovery.id_token_signing_alg_values_supported?.length ? discovery.id_token_signing_alg_values_supported : undefined,
  };
  provider.requiresIdTokenNonce = true;
  provider.refreshAccessToken = (refreshToken: string) =>
    tokenRequest(discovery, config.clientId, clientSecret, { grant_type: "refresh_token", refresh_token: refreshToken });
  // As Better Auth does at startup (context/create-context).
  provider.disableImplicitSignUp = !allowSignUp;
  return provider;
}
