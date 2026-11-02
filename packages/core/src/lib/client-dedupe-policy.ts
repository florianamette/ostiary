/*
 * Identical self-registered public clients (pure policy, tested without a database).
 *
 * MCP clients such as Claude call Dynamic Client Registration every time someone connects
 * them, so each connection used to add one more client with the same name and redirect URIs.
 * A public client (token_endpoint_auth_method "none") has no secret, so handing its client_id
 * out again gives the caller nothing it could not get by registering: an identical anonymous
 * registration gets the existing client back. Confidential clients, clients with an owner and
 * registrations whose metadata differs are never reused.
 */

/** The `oauth_client` columns the dedupe key reads. */
export type DedupeClientFields = {
  name: string | null;
  redirectUris: readonly string[];
  grantTypes: readonly string[] | null;
  responseTypes: readonly string[] | null;
  scopes: readonly string[] | null;
  softwareId: string | null;
  softwareVersion: string | null;
  applicationType: string | null;
  postLogoutRedirectUris: readonly string[] | null;
  /** client_uri: the consent screen's "Visit website" link. */
  uri: string | null;
  /** tos_uri and policy_uri: the consent screen's Terms and Privacy links. */
  tos: string | null;
  policy: string | null;
  contacts: readonly string[] | null;
  tokenEndpointAuthMethod: string | null;
  clientSecret: string | null;
  userId: string | null;
  referenceId: string | null;
};

const set = (values: readonly string[] | null | undefined) => [...new Set(values ?? [])].sort();

/**
 * The key identical public clients share: name, the set of redirect URIs, grant types,
 * response types and scopes, software id and version, application type, post-logout
 * redirect URIs, website, terms, privacy policy and contacts. Null for a client that is never
 * reused or grouped: confidential (it has a secret or another auth method) or owned by a user
 * or organization.
 *
 * A reused client keeps its stored metadata, so every link the consent screen shows is part of
 * the key: otherwise whoever registers "Claude" first, with Claude's redirect URI and their own
 * website, terms or privacy links, would put those links in front of every later Claude user.
 * The logo is left out: the consent screen never shows a self-registered client's logo, and
 * an admin may set one (Set icon) without that stopping the reuse.
 */
export function publicClientDedupeKey(client: DedupeClientFields): string | null {
  if (client.tokenEndpointAuthMethod !== "none" || client.clientSecret) return null;
  if (client.userId || client.referenceId) return null;
  return JSON.stringify([
    client.name ?? "",
    set(client.redirectUris),
    set(client.grantTypes),
    set(client.responseTypes),
    set(client.scopes),
    client.softwareId ?? "",
    client.softwareVersion ?? "",
    client.applicationType ?? "",
    set(client.postLogoutRedirectUris),
    client.uri ?? "",
    client.tos ?? "",
    client.policy ?? "",
    set(client.contacts),
  ]);
}

/** Registration fields that make a request never reused: Better Auth handles it as usual. */
const NOT_REUSED_FIELDS = [
  "resources",
  "software_statement",
  "jwks",
  "jwks_uri",
  "client_secret",
  "backchannel_logout_uri",
  "backchannel_logout_session_required",
] as const;

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function optionalStrings(value: unknown): string[] | null | undefined {
  if (value === undefined || value === null) return null;
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

/**
 * The client an anonymous /oauth2/register request would create, as `oauth_client` columns,
 * with Better Auth's defaults applied (grant authorization_code, response type code, a web
 * application). `scopes` is what a new self-registered client is stored with: Better Auth
 * stores every allowed scope whatever the request asks for, so a request scope is only checked
 * to be within them. Null when the request must go to Better Auth: not public, malformed (it
 * refuses those, an empty `contacts` list included), asks for a scope outside the list, or
 * uses a field never reused.
 */
export function registrationRequestDedupeFields(body: unknown, scopes: readonly string[]): DedupeClientFields | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  if (value.token_endpoint_auth_method !== "none") return null;
  if (NOT_REUSED_FIELDS.some((field) => value[field] !== undefined)) return null;
  // The defaults of a public client, which the key does not cover: anything else is not reused.
  if (value.require_pkce === false || value.dpop_bound_access_tokens === true) return null;
  if (value.subject_type !== undefined && value.subject_type !== "public") return null;

  const name = optionalString(value.client_name);
  const softwareId = optionalString(value.software_id);
  const softwareVersion = optionalString(value.software_version);
  const applicationType = optionalString(value.application_type);
  const redirectUris = optionalStrings(value.redirect_uris);
  const grantTypes = optionalStrings(value.grant_types);
  const responseTypes = optionalStrings(value.response_types);
  const postLogoutRedirectUris = optionalStrings(value.post_logout_redirect_uris);
  const requestedScope = optionalString(value.scope);
  const uri = optionalString(value.client_uri);
  const tos = optionalString(value.tos_uri);
  const policy = optionalString(value.policy_uri);
  const contacts = optionalStrings(value.contacts);
  const fields = [name, softwareId, softwareVersion, applicationType, redirectUris, grantTypes, responseTypes, postLogoutRedirectUris, requestedScope, uri, tos, policy, contacts];
  if (fields.some((field) => field === undefined)) return null;
  if (!redirectUris || redirectUris.length === 0) return null;
  if (contacts?.length === 0) return null; // Better Auth refuses an empty list.

  const allowed = new Set(scopes);
  if (requestedScope && requestedScope.split(/\s+/).some((scope) => scope && !allowed.has(scope))) return null;

  const grants = grantTypes ?? ["authorization_code"];
  return {
    name: name ?? null,
    redirectUris,
    grantTypes: grants,
    responseTypes: responseTypes ?? (grants.includes("authorization_code") ? ["code"] : null),
    scopes: [...scopes],
    softwareId: softwareId ?? null,
    softwareVersion: softwareVersion ?? null,
    applicationType: applicationType ?? "web",
    postLogoutRedirectUris: postLogoutRedirectUris ?? null,
    uri: uri ?? null,
    tos: tos ?? null,
    policy: policy ?? null,
    contacts: contacts ?? null,
    tokenEndpointAuthMethod: "none",
    clientSecret: null,
    userId: null,
    referenceId: null,
  };
}

/** A self-registered client with what the cleanup needs to know about its use. */
export type ClientActivity = {
  clientId: string;
  createdAt: Date | null;
  /** Latest access token, refresh token or consent; null when it was never used. */
  lastActivityAt: Date | null;
  /** Access and refresh tokens neither revoked nor expired. */
  liveTokens: number;
};

const time = (date: Date | null) => date?.getTime() ?? 0;

/** Most recently used first, then most recently registered: the client a group keeps. */
export function compareClientsToKeep(a: ClientActivity, b: ClientActivity): number {
  return time(b.lastActivityAt) - time(a.lastActivityAt) || time(b.createdAt) - time(a.createdAt) || a.clientId.localeCompare(b.clientId);
}

export type DuplicateGroupPlan = {
  key: string;
  keep: string;
  /** No live token: deleted. */
  remove: string[];
  /** Still holding live tokens: left in place, and reported. */
  inUse: string[];
};

/**
 * For each group of clients sharing a key, keeps the most recently used one; of the others,
 * those without a live token are removed and those with one are left alone.
 */
export function planDuplicateCleanup(clients: readonly (ClientActivity & { key: string })[]): DuplicateGroupPlan[] {
  const groups = new Map<string, (ClientActivity & { key: string })[]>();
  for (const client of clients) {
    const group = groups.get(client.key);
    if (group) group.push(client);
    else groups.set(client.key, [client]);
  }
  const plans: DuplicateGroupPlan[] = [];
  for (const [key, members] of groups) {
    if (members.length < 2) continue;
    const [keep, ...others] = [...members].sort(compareClientsToKeep);
    plans.push({
      key,
      keep: keep!.clientId,
      remove: others.filter((client) => client.liveTokens === 0).map((client) => client.clientId),
      inUse: others.filter((client) => client.liveTokens > 0).map((client) => client.clientId),
    });
  }
  return plans;
}

/** Longest "never used" age an admin may enter, in days. */
export const MAX_UNUSED_CLIENT_DAYS = 3650;

/** Whether a client was never used (no token, no consent) and registered over `days` days ago. */
export function neverUsedFor(client: ClientActivity, days: number, now = new Date()): boolean {
  if (client.lastActivityAt || client.liveTokens > 0 || !client.createdAt) return false;
  return now.getTime() - client.createdAt.getTime() > days * 24 * 60 * 60 * 1000;
}
