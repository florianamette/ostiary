import { PUBLIC_ORGANIZATION_ID } from "@ostiary/core/lib/organization-public";
import { resourceAccess, type ApiAccess } from "@ostiary/core/lib/oauth-resource-policy";
import { resourceScopes } from "@ostiary/core/lib/oauth-scopes";

/*
 * API keys: long-lived credentials a user (or an organization) creates for scripts, each for one API registered in
 * Ostiary (an `oauth_resource` row) and some of that API's scopes. The API checks a key by
 * calling the verification endpoint (see api-key-verification.ts). This file holds the pure
 * rules, shared by the account dashboard, the admin console and the tests.
 */

export type ApiKeySettings = {
  /** Off: nobody can create a key, and every key fails verification (a kill switch). */
  enabled: boolean;
  /** Longest lifetime a new key may have, in days. Every key expires. */
  maxLifetimeDays: number;
};

export const DEFAULT_API_KEY_SETTINGS: ApiKeySettings = { enabled: false, maxLifetimeDays: 90 };

/** Upper bound for the admin setting (the plugin's `keyExpiration.maxExpiresIn`). */
export const MAX_LIFETIME_DAYS_LIMIT = 365;

/** Lifetimes offered when creating a key, in days (those above the setting are hidden). */
export const LIFETIME_CHOICES_DAYS = [7, 30, 90, 180, 365] as const;

export const API_KEY_NAME_MAX_LENGTH = 64;

/** Keys one account may hold at a time. */
export const MAX_KEYS_PER_USER = 25;

/** Keys one organization may hold at a time. */
export const MAX_KEYS_PER_ORGANIZATION = 50;

/**
 * The plugin's configurations (`configId`). A key's configuration says who owns it, and so
 * what `referenceId` holds: a user id for "default", an organization id for "organization".
 */
export const USER_KEY_CONFIG_ID = "default";
export const ORGANIZATION_KEY_CONFIG_ID = "organization";

export type KeyOwnerType = "user" | "organization";

export function keyOwnerType(configId: string | null | undefined): KeyOwnerType {
  return configId === ORGANIZATION_KEY_CONFIG_ID ? "organization" : "user";
}

/** Organization roles that may create, list and revoke the organization's keys. */
export const ORGANIZATION_KEY_MANAGER_ROLES = ["owner", "admin"] as const;

/** Whether a member's role (Better Auth stores several as "a,b") lets them manage org keys. */
export function canManageOrganizationKeys(role: string | null | undefined): boolean {
  if (!role) return false;
  return role
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .some((r) => (ORGANIZATION_KEY_MANAGER_ROLES as readonly string[]).includes(r));
}

/** The default Public workspace holds every account: it never owns keys. */
export function organizationMayOwnKeys(organizationId: string): boolean {
  return Boolean(organizationId) && organizationId !== PUBLIC_ORGANIZATION_ID;
}

/**
 * Per-key limit enforced by the plugin on every verification: the API should cache a
 * successful answer for a short while rather than verify on each request.
 */
export const KEY_RATE_LIMIT = { timeWindowMs: 60_000, maxRequests: 300 } as const;

/** The verification endpoint's path, under /api/auth. */
export const API_KEY_VERIFY_PATH = "/api-key/verify";


/** Reads the stored settings field by field, falling back to the defaults (off). */
export function parseApiKeySettings(raw: unknown): ApiKeySettings {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const days = value.maxLifetimeDays;
  return {
    enabled: value.enabled === true,
    maxLifetimeDays:
      typeof days === "number" && Number.isInteger(days) && days >= 1 && days <= MAX_LIFETIME_DAYS_LIMIT
        ? days
        : DEFAULT_API_KEY_SETTINGS.maxLifetimeDays,
  };
}

/** Lifetimes to offer: the standard choices up to the maximum, and the maximum itself. */
export function lifetimeChoices(maxLifetimeDays: number): number[] {
  return [...new Set([...LIFETIME_CHOICES_DAYS.filter((days) => days <= maxLifetimeDays), maxLifetimeDays])].sort(
    (a, b) => a - b,
  );
}

/** An API as the key rules see it, from its `oauth_resource` row. */
export type KeyApi = {
  identifier: string;
  name: string;
  scopes: string[];
  disabled: boolean;
  access: ApiAccess;
};

export function toKeyApi(row: {
  identifier: string;
  name: string;
  allowedScopes: string[] | null;
  metadata: unknown;
  disabled: boolean | null;
}): KeyApi {
  return {
    identifier: row.identifier,
    name: row.name,
    scopes: resourceScopes(row),
    disabled: Boolean(row.disabled),
    access: resourceAccess(row.metadata),
  };
}

/**
 * Whether keys may be created for (and verified against) an API. Not for the auth server
 * itself, a disabled API, or an API without scopes. Not for an API limited to linked
 * applications either: an admin chose which apps may call it, and a key is not tied to an
 * app, so allowing keys would open a way around that choice.
 */
export function apiAcceptsKeys(api: KeyApi, authServer: string | undefined): boolean {
  if (authServer && api.identifier.replace(/\/$/, "") === authServer.replace(/\/$/, "")) return false;
  return !api.disabled && api.access !== "linked" && api.scopes.length > 0;
}

/** What a key grants: one API and its scopes, stored as the plugin's `permissions`. */
export type KeyGrant = { api: string; scopes: string[] };

export function grantPermissions(grant: KeyGrant): Record<string, string[]> {
  return { [grant.api]: [...grant.scopes] };
}

/** Reads `apikey.permissions` (JSON text, or already parsed). Null unless exactly one API. */
export function parseKeyGrant(permissions: unknown): KeyGrant | null {
  let value = permissions;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length !== 1) return null;
  const [api, scopes] = entries[0]!;
  if (!Array.isArray(scopes) || !scopes.every((scope) => typeof scope === "string")) return null;
  return { api, scopes: scopes as string[] };
}

export type NewKeyInput = {
  name: string;
  api: string;
  scopes: string[];
  expiresInDays: number;
};

export type NewKeyError = "disabled" | "name" | "api" | "scopes" | "lifetime" | "limit";

export type NewKey = { name: string; grant: KeyGrant; expiresInSeconds: number };

/** Checks a key request against the settings and the chosen API. */
export function validateNewKey(
  input: NewKeyInput,
  context: {
    settings: ApiKeySettings;
    api: KeyApi | null;
    authServer: string | undefined;
    keysHeld: number;
    /** Cap for the owner: MAX_KEYS_PER_USER unless given (MAX_KEYS_PER_ORGANIZATION for orgs). */
    maxKeys?: number;
  },
): { ok: true; value: NewKey } | { ok: false; error: NewKeyError } {
  if (!context.settings.enabled) return { ok: false, error: "disabled" };
  if (context.keysHeld >= (context.maxKeys ?? MAX_KEYS_PER_USER)) return { ok: false, error: "limit" };
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > API_KEY_NAME_MAX_LENGTH) return { ok: false, error: "name" };
  const api = context.api;
  if (!api || api.identifier !== input.api || !apiAcceptsKeys(api, context.authServer)) {
    return { ok: false, error: "api" };
  }
  const scopes = [...new Set(Array.isArray(input.scopes) ? input.scopes : [])];
  if (scopes.length === 0 || scopes.some((scope) => !api.scopes.includes(scope))) {
    return { ok: false, error: "scopes" };
  }
  const days = input.expiresInDays;
  if (!Number.isInteger(days) || days < 1 || days > context.settings.maxLifetimeDays) {
    return { ok: false, error: "lifetime" };
  }
  return { ok: true, value: { name, grant: { api: api.identifier, scopes }, expiresInSeconds: days * 24 * 60 * 60 } };
}

/** Why a verification failed, as returned to the API (`error`). */
export type VerifyError = "invalid_key" | "expired" | "rate_limited" | "api_keys_disabled" | "api_unavailable";

/**
 * The checks that come before the plugin's own (enabled, expiry, rate limit): the key is for
 * the API asking, its owner may still use it, and the API still accepts keys. The owner is the
 * user (null when deleted; banned until the ban ends) or, for an organization's key, the
 * organization (null when deleted, or the Public workspace). A key for
 * another API gets the same answer as an unknown key. Returns the scopes the key grants
 * now: those it was created with that the API still declares.
 */
export function checkKeyForApi(params: {
  grant: KeyGrant | null;
  requestedApi: string;
  api: KeyApi | null;
  authServer: string | undefined;
  owner: { banned: boolean | null; banExpires: Date | null } | null;
  now?: Date;
}): { ok: true; scopes: string[] } | { ok: false; error: VerifyError } {
  const { grant, requestedApi, api, owner } = params;
  const now = params.now ?? new Date();
  if (!grant || grant.api !== requestedApi) return { ok: false, error: "invalid_key" };
  if (!owner) return { ok: false, error: "invalid_key" };
  if (owner.banned && (!owner.banExpires || owner.banExpires.getTime() > now.getTime())) {
    return { ok: false, error: "invalid_key" };
  }
  if (!api || !apiAcceptsKeys(api, params.authServer)) return { ok: false, error: "api_unavailable" };
  const scopes = grant.scopes.filter((scope) => api.scopes.includes(scope));
  if (scopes.length === 0) return { ok: false, error: "api_unavailable" };
  return { ok: true, scopes };
}

/** Maps the plugin's verification error codes to the endpoint's. */
export function pluginErrorToVerifyError(code: string | undefined): VerifyError {
  switch (code) {
    case "KEY_EXPIRED":
      return "expired";
    case "RATE_LIMITED":
    case "USAGE_EXCEEDED":
      return "rate_limited";
    default:
      return "invalid_key";
  }
}
