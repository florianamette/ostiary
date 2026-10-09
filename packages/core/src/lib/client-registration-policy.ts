import { OIDC_SCOPES } from "@ostiary/core/lib/oauth-scopes";

/*
 * Self-registration of OAuth clients, as MCP clients and AI agents expect:
 *
 * - Dynamic Client Registration (RFC 7591): the client POSTs its metadata to
 *   /oauth2/register and gets a client_id back.
 * - Client ID Metadata Documents: the client_id is an HTTPS URL; Better Auth fetches the
 *   JSON document published there (the `@better-auth/cimd` discovery) and creates the client.
 *
 * Both are off by default. This file holds the pure policy (parsing, what a self-registered
 * client may get), so it can be tested without a database.
 */

/** "signed_in": only a signed-in user may register (their session cookie). "open": anyone. */
export const DYNAMIC_REGISTRATION_MODES = ["off", "signed_in", "open"] as const;
export type DynamicRegistrationMode = (typeof DYNAMIC_REGISTRATION_MODES)[number];

export type ClientRegistrationSettings = {
  dynamic: DynamicRegistrationMode;
  metadataDocuments: boolean;
  /** Every scope a self-registered client may request. Never client_credentials scopes. */
  scopes: string[];
  /** Hosts whose metadata documents are accepted. Empty: any public HTTPS host. */
  metadataDocumentHosts: string[];
  /** New self-registered clients per hour, across every instance. */
  maxRegistrationsPerHour: number;
};

export const DEFAULT_CLIENT_REGISTRATION_SETTINGS: ClientRegistrationSettings = {
  dynamic: "off",
  metadataDocuments: false,
  scopes: [...OIDC_SCOPES],
  metadataDocumentHosts: [],
  maxRegistrationsPerHour: 30,
};

export const MAX_REGISTRATIONS_PER_HOUR_LIMIT = 1000;

/** Self-registered clients sign users in; machine (client_credentials) access stays admin-only. */
export const SELF_REGISTERED_GRANT_TYPES = ["authorization_code", "refresh_token"] as const;

/** How an OAuth client came to exist, shown on the Applications page and the consent screen. */
export type RegistrationSource = "admin" | "dynamic" | "metadata_document";

/** Key in `oauth_client.metadata` marking a client created through /oauth2/register. */
export const REGISTRATION_METADATA_KEY = "ostiary_registration";

/** `clientDiscoveryId` Better Auth stores on clients created from a metadata document. */
export const METADATA_DOCUMENT_DISCOVERY_ID = "cimd";

const SCOPE_TOKEN = /^[\x21\x23-\x5B\x5D-\x7E]+$/;
const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
}

/** Lower-cases a host and strips a scheme or path pasted with it. Null when it is not a DNS name. */
export function normalizeHost(raw: string): string | null {
  let host = raw.trim().toLowerCase();
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      return null;
    }
  }
  host = host.replace(/\/.*$/, "").replace(/\.$/, "");
  return HOST.test(host) ? host : null;
}

/**
 * Reads the stored settings, falling back to the defaults field by field, so a document
 * written by an older or newer version never turns registration on by accident.
 */
export function parseClientRegistrationSettings(raw: unknown): ClientRegistrationSettings {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const defaults = DEFAULT_CLIENT_REGISTRATION_SETTINGS;
  const dynamic = (DYNAMIC_REGISTRATION_MODES as readonly unknown[]).includes(value.dynamic)
    ? (value.dynamic as DynamicRegistrationMode)
    : defaults.dynamic;
  const scopes = uniqueStrings(value.scopes).filter((scope) => SCOPE_TOKEN.test(scope));
  const hosts = uniqueStrings(value.metadataDocumentHosts)
    .map(normalizeHost)
    .filter((host): host is string => host !== null);
  const max = value.maxRegistrationsPerHour;
  return {
    dynamic,
    metadataDocuments: value.metadataDocuments === true,
    scopes: Array.isArray(value.scopes) ? scopes : [...defaults.scopes],
    metadataDocumentHosts: [...new Set(hosts)],
    maxRegistrationsPerHour:
      typeof max === "number" && Number.isInteger(max) && max >= 0 && max <= MAX_REGISTRATIONS_PER_HOUR_LIMIT
        ? max
        : defaults.maxRegistrationsPerHour,
  };
}

/** True when either self-registration mechanism is on. */
export function selfRegistrationEnabled(settings: ClientRegistrationSettings): boolean {
  return settings.dynamic !== "off" || settings.metadataDocuments;
}

/** The scopes self-registered clients get: the allowed ones that still exist on the server. */
export function effectiveRegistrationScopes(
  settings: ClientRegistrationSettings,
  serverScopes: readonly string[],
): string[] {
  const available = new Set(serverScopes);
  return settings.scopes.filter((scope) => available.has(scope));
}

/** The oauth-provider options this module owns. */
export type RegistrationProviderOptions = {
  scopes?: string[];
  allowDynamicClientRegistration?: boolean;
  allowUnauthenticatedClientRegistration?: boolean;
  clientRegistrationDefaultScopes?: string[];
  clientRegistrationAllowedScopes?: string[];
  clientRegistrationRequirePKCE?: boolean;
  extensions?: unknown[];
};

/**
 * Writes the settings into the oauth-provider plugin's options, which its endpoints read on
 * every request (registration, discovery, client lookup). `metadataDocuments` is the
 * extension carrying the metadata-document discovery: removing it also makes the clients it
 * created unusable, since Better Auth no longer resolves them.
 */
export function applyClientRegistration(
  options: RegistrationProviderOptions,
  settings: ClientRegistrationSettings,
  metadataDocuments: unknown,
): void {
  const scopes = effectiveRegistrationScopes(settings, options.scopes ?? []);
  options.allowDynamicClientRegistration = settings.dynamic !== "off";
  options.allowUnauthenticatedClientRegistration = settings.dynamic === "open";
  // Both lists set: Better Auth stores their union on each client, and falls back to every
  // server scope (API scopes included) when they are left out.
  options.clientRegistrationDefaultScopes = scopes;
  options.clientRegistrationAllowedScopes = scopes;
  options.clientRegistrationRequirePKCE = true;
  const others = (options.extensions ?? []).filter((extension) => extension !== metadataDocuments);
  options.extensions = settings.metadataDocuments ? [...others, metadataDocuments] : others;
}

/**
 * Checks a registration request beyond what Better Auth enforces: only interactive grants.
 * Returns the reason it is refused, or null.
 */
export function registrationRequestError(body: unknown): string | null {
  const grantTypes = (body as { grant_types?: unknown } | null)?.grant_types;
  if (grantTypes === undefined) return null;
  if (!Array.isArray(grantTypes)) return "grant_types must be an array";
  const allowed = new Set<string>(SELF_REGISTERED_GRANT_TYPES);
  const refused = grantTypes.find((grant) => typeof grant !== "string" || !allowed.has(grant));
  return refused === undefined
    ? null
    : `grant_type ${String(refused)} is not available to self-registered clients`;
}

/** Whether a metadata document URL is on the allowlist (any host when the list is empty). */
export function metadataDocumentHostAllowed(url: string, hosts: readonly string[]): boolean {
  if (hosts.length === 0) return true;
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return hosts.includes(hostname);
}

function parseMetadata(metadata: unknown): Record<string, unknown> | null {
  // Better Auth may store the JSON as a string inside the jsonb column.
  if (typeof metadata === "string") {
    try {
      return parseMetadata(JSON.parse(metadata));
    } catch {
      return null;
    }
  }
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : null;
}

/**
 * How a client row was registered. Admin-registered only with the explicit marker
 * (`oauth_client.admin_registered`, set by the admin console after it creates a client):
 * anything else, including a row whose marker is missing or unreadable, is treated as
 * self-registered, so it gets the self-registration limits rather than an admin's trust.
 */
export function registrationSource(row: {
  clientDiscoveryId?: string | null;
  metadata?: unknown;
  adminRegistered?: boolean | null;
}): RegistrationSource {
  if (row.clientDiscoveryId === METADATA_DOCUMENT_DISCOVERY_ID) return "metadata_document";
  if (parseMetadata(row.metadata)?.[REGISTRATION_METADATA_KEY] === "dynamic") return "dynamic";
  return row.adminRegistered === true ? "admin" : "dynamic";
}

/** `metadata` with the dynamic-registration marker added. */
export function markDynamicRegistration(metadata: unknown): Record<string, unknown> {
  return { ...(parseMetadata(metadata) ?? {}), [REGISTRATION_METADATA_KEY]: "dynamic" };
}

/**
 * `oauth_client.reference_id` of clients registered from the admin console. Better Auth lets
 * whoever its `clientReference` maps to this value manage them: every platform admin, and
 * nobody else. The admin who created a client does not own it personally, so losing the
 * admin role (or the account) ends their control over it.
 */
export const PLATFORM_CLIENT_REFERENCE = "ostiary:platform";

/**
 * Better Auth's client management actions (`clientPrivileges`). Platform admins may do
 * everything. Anyone else may only create a client through Dynamic Client Registration
 * (`/oauth2/register`, which has its own limits): no other create, read, list, update,
 * secret rotation or deletion.
 */
export function clientActionAllowed(input: { action: string; isAdmin: boolean; path: string | undefined }): boolean {
  if (input.isAdmin) return true;
  return input.action === "create" && input.path === "/oauth2/register";
}

/** Fields of a client update (Better Auth's `update` object) that the policy limits. */
type ClientUpdate = {
  scope?: unknown;
  grant_types?: unknown;
  client_credentials_scopes?: unknown;
  skip_consent?: unknown;
};

/**
 * Checks an update to a self-registered client against the self-registration policy: it
 * may not gain a scope outside `allowedScopes`, a grant other than authorization code and
 * refresh token, machine (client_credentials) scopes, or skip the consent screen.
 * Returns the reason it is refused, or null.
 */
export function selfRegisteredUpdateError(update: unknown, allowedScopes: readonly string[]): string | null {
  const value = (update && typeof update === "object" ? update : {}) as ClientUpdate;
  if (value.scope !== undefined) {
    if (typeof value.scope !== "string") return "scope must be a string";
    const allowed = new Set(allowedScopes);
    const refused = value.scope.split(/\s+/).filter(Boolean).find((scope) => !allowed.has(scope));
    if (refused) return `scope ${refused} is not available to self-registered clients`;
  }
  if (value.grant_types !== undefined) {
    const refused = registrationRequestError({ grant_types: value.grant_types });
    if (refused) return refused;
  }
  if (Array.isArray(value.client_credentials_scopes) && value.client_credentials_scopes.length > 0) {
    return "client_credentials scopes are not available to self-registered clients";
  }
  if (value.client_credentials_scopes !== undefined && !Array.isArray(value.client_credentials_scopes)) {
    return "client_credentials_scopes must be an array";
  }
  if (value.skip_consent === true) return "A self-registered client cannot skip the consent screen.";
  return null;
}

/** The client id in an HTTP Basic `Authorization` header (RFC 6749 2.3.1), or null. */
function basicAuthClientId(authorization: string | null | undefined): string | null {
  const match = /^Basic\s+(\S+)\s*$/i.exec(authorization ?? "");
  if (!match) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return null;
  }
  const colon = decoded.indexOf(":");
  if (colon <= 0) return null;
  try {
    return decodeURIComponent(decoded.slice(0, colon).replace(/\+/g, "%20"));
  } catch {
    return null;
  }
}

/** `sub` and `iss` of a client assertion (RFC 7523: both are the client id). Not verified. */
function assertionClientIds(assertion: unknown): string[] {
  if (typeof assertion !== "string") return [];
  const payload = assertion.split(".")[1];
  if (!payload) return [];
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    return [claims.sub, claims.iss].filter((v): v is string => typeof v === "string" && v.length > 0);
  } catch {
    return [];
  }
}

/**
 * Every client id a token or device request names, however the client authenticates:
 * `client_id` in the body, HTTP Basic, or a client assertion (private_key_jwt). Used to
 * apply a per-client rule before Better Auth authenticates the client, so the rule must
 * hold for each of them (Better Auth then refuses a request whose ids disagree).
 */
export function requestClientIds(headers: Headers | null | undefined, body: unknown): string[] {
  const fields = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const ids = [
    typeof fields.client_id === "string" && fields.client_id ? fields.client_id : null,
    basicAuthClientId(headers?.get("authorization")),
    ...assertionClientIds(fields.client_assertion),
  ].filter((id): id is string => id !== null);
  return [...new Set(ids)];
}
