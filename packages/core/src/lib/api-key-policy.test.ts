import { describe, expect, it } from "vitest";

import {
  apiAcceptsKeys,
  canManageOrganizationKeys,
  checkKeyForApi,
  keyOwnerType,
  MAX_KEYS_PER_ORGANIZATION,
  organizationMayOwnKeys,
  DEFAULT_API_KEY_SETTINGS,
  grantPermissions,
  lifetimeChoices,
  MAX_KEYS_PER_USER,
  parseApiKeySettings,
  parseKeyGrant,
  pluginErrorToVerifyError,
  toKeyApi,
  validateNewKey,
  type KeyApi,
} from "@ostiary/core/lib/api-key-policy";

const AUTH = "https://auth.example.com";
const orders: KeyApi = {
  identifier: "https://api.example.com",
  name: "Orders",
  scopes: ["orders:read", "orders:write"],
  disabled: false,
  access: "all",
};
const enabled = { enabled: true, maxLifetimeDays: 90 };

describe("parseApiKeySettings", () => {
  it("is off with a 90-day maximum by default", () => {
    expect(parseApiKeySettings(undefined)).toEqual(DEFAULT_API_KEY_SETTINGS);
    expect(DEFAULT_API_KEY_SETTINGS.enabled).toBe(false);
  });

  it("keeps valid values and replaces invalid ones field by field", () => {
    expect(parseApiKeySettings({ enabled: true, maxLifetimeDays: 30 })).toEqual({ enabled: true, maxLifetimeDays: 30 });
    expect(parseApiKeySettings({ enabled: "yes", maxLifetimeDays: 400 })).toEqual({ enabled: false, maxLifetimeDays: 90 });
    expect(parseApiKeySettings({ enabled: true, maxLifetimeDays: 1.5 })).toEqual({ enabled: true, maxLifetimeDays: 90 });
  });
});

describe("lifetimeChoices", () => {
  it("offers the standard choices up to the maximum, and the maximum", () => {
    expect(lifetimeChoices(90)).toEqual([7, 30, 90]);
    expect(lifetimeChoices(45)).toEqual([7, 30, 45]);
    expect(lifetimeChoices(3)).toEqual([3]);
  });
});

describe("toKeyApi / apiAcceptsKeys", () => {
  it("reads declared scopes and access from the resource row", () => {
    const api = toKeyApi({
      identifier: "https://api.example.com",
      name: "Orders",
      allowedScopes: ["orders:write"],
      metadata: { scopes: ["orders:read", "openid"], access: "linked" },
      disabled: null,
    });
    expect(api).toEqual({ ...orders, access: "linked" });
  });

  it("refuses the auth server, disabled and linked-only APIs, and APIs without scopes", () => {
    expect(apiAcceptsKeys(orders, AUTH)).toBe(true);
    expect(apiAcceptsKeys({ ...orders, identifier: `${AUTH}/` }, AUTH)).toBe(false);
    expect(apiAcceptsKeys({ ...orders, disabled: true }, AUTH)).toBe(false);
    expect(apiAcceptsKeys({ ...orders, access: "linked" }, AUTH)).toBe(false);
    expect(apiAcceptsKeys({ ...orders, scopes: [] }, AUTH)).toBe(false);
  });
});

describe("parseKeyGrant", () => {
  it("round-trips the plugin's permissions", () => {
    const grant = { api: orders.identifier, scopes: ["orders:read"] };
    expect(parseKeyGrant(JSON.stringify(grantPermissions(grant)))).toEqual(grant);
    expect(parseKeyGrant(grantPermissions(grant))).toEqual(grant);
  });

  it("rejects anything but exactly one API with a list of scopes", () => {
    expect(parseKeyGrant(null)).toBeNull();
    expect(parseKeyGrant("not json")).toBeNull();
    expect(parseKeyGrant({})).toBeNull();
    expect(parseKeyGrant({ a: ["x"], b: ["y"] })).toBeNull();
    expect(parseKeyGrant({ a: "x" })).toBeNull();
    expect(parseKeyGrant({ a: [1] })).toBeNull();
  });
});

describe("validateNewKey", () => {
  const input = { name: " deploy script ", api: orders.identifier, scopes: ["orders:read"], expiresInDays: 30 };
  const context = { settings: enabled, api: orders, authServer: AUTH, keysHeld: 0 };

  it("accepts a key within the rules", () => {
    expect(validateNewKey(input, context)).toEqual({
      ok: true,
      value: { name: "deploy script", grant: { api: orders.identifier, scopes: ["orders:read"] }, expiresInSeconds: 30 * 86400 },
    });
  });

  it("refuses when keys are off or the account holds too many", () => {
    expect(validateNewKey(input, { ...context, settings: { ...enabled, enabled: false } })).toEqual({ ok: false, error: "disabled" });
    expect(validateNewKey(input, { ...context, keysHeld: MAX_KEYS_PER_USER })).toEqual({ ok: false, error: "limit" });
  });

  it("needs a name", () => {
    expect(validateNewKey({ ...input, name: "  " }, context)).toEqual({ ok: false, error: "name" });
    expect(validateNewKey({ ...input, name: "x".repeat(65) }, context)).toEqual({ ok: false, error: "name" });
  });

  it("needs an API that accepts keys", () => {
    expect(validateNewKey(input, { ...context, api: null })).toEqual({ ok: false, error: "api" });
    expect(validateNewKey(input, { ...context, api: { ...orders, access: "linked" } })).toEqual({ ok: false, error: "api" });
    expect(validateNewKey({ ...input, api: "https://other.example.com" }, context)).toEqual({ ok: false, error: "api" });
  });

  it("needs some of the API's own scopes, and no other", () => {
    expect(validateNewKey({ ...input, scopes: [] }, context)).toEqual({ ok: false, error: "scopes" });
    expect(validateNewKey({ ...input, scopes: ["orders:read", "admin"] }, context)).toEqual({ ok: false, error: "scopes" });
    expect(validateNewKey({ ...input, scopes: ["openid"] }, context)).toEqual({ ok: false, error: "scopes" });
  });

  it("keeps the lifetime between one day and the maximum", () => {
    expect(validateNewKey({ ...input, expiresInDays: 0 }, context)).toEqual({ ok: false, error: "lifetime" });
    expect(validateNewKey({ ...input, expiresInDays: 91 }, context)).toEqual({ ok: false, error: "lifetime" });
    expect(validateNewKey({ ...input, expiresInDays: 2.5 }, context)).toEqual({ ok: false, error: "lifetime" });
    expect(validateNewKey({ ...input, expiresInDays: 90 }, context).ok).toBe(true);
  });
});

describe("checkKeyForApi", () => {
  const grant = { api: orders.identifier, scopes: ["orders:read", "orders:write"] };
  const owner = { banned: false, banExpires: null };
  const base = { grant, requestedApi: orders.identifier, api: orders, authServer: AUTH, owner };

  it("returns the key's scopes the API still declares", () => {
    expect(checkKeyForApi(base)).toEqual({ ok: true, scopes: ["orders:read", "orders:write"] });
    expect(checkKeyForApi({ ...base, api: { ...orders, scopes: ["orders:read"] } })).toEqual({ ok: true, scopes: ["orders:read"] });
  });

  it("answers a key for another API like an unknown key", () => {
    expect(checkKeyForApi({ ...base, requestedApi: "https://other.example.com" })).toEqual({ ok: false, error: "invalid_key" });
    expect(checkKeyForApi({ ...base, grant: null })).toEqual({ ok: false, error: "invalid_key" });
  });

  it("refuses keys of banned or deleted accounts, until a temporary ban ends", () => {
    const now = new Date("2026-10-08T12:00:00Z");
    expect(checkKeyForApi({ ...base, owner: null })).toEqual({ ok: false, error: "invalid_key" });
    expect(checkKeyForApi({ ...base, owner: { banned: true, banExpires: null }, now })).toEqual({ ok: false, error: "invalid_key" });
    expect(
      checkKeyForApi({ ...base, owner: { banned: true, banExpires: new Date("2026-10-09T00:00:00Z") }, now }),
    ).toEqual({ ok: false, error: "invalid_key" });
    expect(checkKeyForApi({ ...base, owner: { banned: true, banExpires: new Date("2026-10-01T00:00:00Z") }, now }).ok).toBe(true);
  });

  it("refuses when the API was disabled, deleted, limited to linked apps, or lost the key's scopes", () => {
    expect(checkKeyForApi({ ...base, api: null })).toEqual({ ok: false, error: "api_unavailable" });
    expect(checkKeyForApi({ ...base, api: { ...orders, disabled: true } })).toEqual({ ok: false, error: "api_unavailable" });
    expect(checkKeyForApi({ ...base, api: { ...orders, access: "linked" } })).toEqual({ ok: false, error: "api_unavailable" });
    expect(checkKeyForApi({ ...base, api: { ...orders, scopes: ["orders:delete"] } })).toEqual({ ok: false, error: "api_unavailable" });
  });
});

describe("pluginErrorToVerifyError", () => {
  it("maps the plugin's codes", () => {
    expect(pluginErrorToVerifyError("KEY_EXPIRED")).toBe("expired");
    expect(pluginErrorToVerifyError("RATE_LIMITED")).toBe("rate_limited");
    expect(pluginErrorToVerifyError("USAGE_EXCEEDED")).toBe("rate_limited");
    expect(pluginErrorToVerifyError("KEY_DISABLED")).toBe("invalid_key");
    expect(pluginErrorToVerifyError(undefined)).toBe("invalid_key");
  });
});

describe("organization keys", () => {
  it("tells the owner type from the plugin configuration", () => {
    expect(keyOwnerType("organization")).toBe("organization");
    expect(keyOwnerType("default")).toBe("user");
    expect(keyOwnerType(null)).toBe("user");
  });

  it("lets owners and admins manage the organization's keys, not members", () => {
    expect(canManageOrganizationKeys("owner")).toBe(true);
    expect(canManageOrganizationKeys("admin")).toBe(true);
    expect(canManageOrganizationKeys("member,admin")).toBe(true);
    expect(canManageOrganizationKeys("member")).toBe(false);
    expect(canManageOrganizationKeys("")).toBe(false);
    expect(canManageOrganizationKeys(null)).toBe(false);
  });

  it("never gives keys to the Public workspace", () => {
    expect(organizationMayOwnKeys("org_public_b2c")).toBe(false);
    expect(organizationMayOwnKeys("")).toBe(false);
    expect(organizationMayOwnKeys("org_acme")).toBe(true);
  });

  it("caps an organization's keys separately from a user's", () => {
    const input = { name: "CI", api: orders.identifier, scopes: ["orders:read"], expiresInDays: 30 };
    const context = { settings: enabled, api: orders, authServer: AUTH, maxKeys: MAX_KEYS_PER_ORGANIZATION };
    expect(validateNewKey(input, { ...context, keysHeld: MAX_KEYS_PER_USER }).ok).toBe(true);
    expect(validateNewKey(input, { ...context, keysHeld: MAX_KEYS_PER_ORGANIZATION })).toEqual({ ok: false, error: "limit" });
  });
});
