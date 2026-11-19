import { defaultKeyHasher } from "@better-auth/api-key";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apikey, oauthClientResource, organization, user } from "@ostiary/core/db/schema";
import { USER_KEY_CONFIG_ID, ORGANIZATION_KEY_CONFIG_ID } from "@ostiary/core/lib/api-key-policy";

/*
 * POST /api-key/verify, driven through the endpoint with the OAuth provider, the settings and
 * the database faked. Each table answers with the rows the test sets (queries are not filtered:
 * a test only seeds what the endpoint should find).
 */

const API = "https://api.example.com";
const AUTH_SERVER = "https://auth.example.com";

let rows = new Map<unknown, Record<string, unknown>[]>();
let authenticated: { clientId: string } | Error = { clientId: "client-1" };
let source: string | null = "admin";
let keysEnabled = true;
let pluginResult: unknown;

vi.mock("@ostiary/core/db/index", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({ limit: async () => rows.get(table) ?? [] }),
      }),
    }),
  },
}));
vi.mock("@better-auth/oauth-provider", () => ({
  getOAuthProviderApi: () => ({
    authenticateClient: async () => {
      if (authenticated instanceof Error) throw authenticated;
      return { client: authenticated };
    },
  }),
}));
vi.mock("@ostiary/core/lib/client-registration", () => ({ clientRegistrationSource: async () => source }));
vi.mock("@ostiary/core/lib/api-keys", () => ({
  currentApiKeySettings: async () => ({ enabled: keysEnabled, maxLifetimeDays: 90 }),
  findKeyApi: async (identifier: string) =>
    identifier === API ? { identifier: API, name: "Orders", scopes: ["orders:read", "orders:write"], acceptsKeys: true } : null,
}));

const { apiKeyVerification } = await import("@ostiary/core/lib/api-key-verification");

const verifyApiKey = vi.fn(async () => pluginResult);
const plugin = apiKeyVerification({ providerOptions: {} as never, verifyApiKey: verifyApiKey as never, authServer: AUTH_SERVER });
const endpoint = plugin.endpoints.ostiaryVerifyApiKey as unknown as (ctx: unknown) => Promise<unknown>;

async function verify(key = "ost_secret_key", resource = API): Promise<Record<string, unknown> | string> {
  try {
    return (await endpoint({ body: { key, resource }, headers: new Headers(), asResponse: false })) as Record<string, unknown>;
  } catch (error) {
    const e = error as { body?: { error?: string }; status?: string };
    return e.body?.error ?? String(e.status);
  }
}

async function seedKey(owner: { type: "user" | "organization"; id: string }, scopes = ["orders:read"]) {
  rows.set(apikey, [
    {
      permissions: JSON.stringify({ [API]: scopes }),
      referenceId: owner.id,
      configId: owner.type === "user" ? USER_KEY_CONFIG_ID : ORGANIZATION_KEY_CONFIG_ID,
    },
  ]);
  return defaultKeyHasher("ost_secret_key");
}

beforeEach(() => {
  rows = new Map([[oauthClientResource, [{ id: "link-1" }]]]);
  authenticated = { clientId: "client-1" };
  source = "admin";
  keysEnabled = true;
  pluginResult = { valid: true, error: null, key: { id: "key-1", referenceId: "u1", expiresAt: null } };
  verifyApiKey.mockClear();
});

describe("API key verification", () => {
  it("refuses callers that are not admin-registered or not linked to the API", async () => {
    source = "dynamic";
    expect(await verify()).toBe("invalid_client");
    source = "admin";
    rows.delete(oauthClientResource);
    expect(await verify()).toBe("access_denied");
    authenticated = Object.assign(new Error("bad secret"), { body: { error: "invalid_client" } });
    expect(await verify()).toBe("invalid_client");
  });

  it("answers api_keys_disabled while keys are off", async () => {
    keysEnabled = false;
    expect(await verify()).toEqual({ valid: false, error: "api_keys_disabled" });
  });

  it("answers invalid_key for an unknown key, without touching the plugin", async () => {
    expect(await verify()).toEqual({ valid: false, error: "invalid_key" });
    expect(verifyApiKey).not.toHaveBeenCalled();
  });

  it("verifies a user's key for its API and returns its scopes", async () => {
    await seedKey({ type: "user", id: "u1" });
    rows.set(user, [{ banned: false, banExpires: null }]);
    expect(await verify()).toMatchObject({ valid: true, keyId: "key-1", ownerType: "user", userId: "u1", api: API, scopes: ["orders:read"] });
    expect(verifyApiKey).toHaveBeenCalledOnce();
  });

  it("answers like an unknown key for another API or a banned owner, before the plugin counts a use", async () => {
    await seedKey({ type: "user", id: "u1" });
    rows.set(user, [{ banned: false, banExpires: null }]);
    expect(await verify("ost_secret_key", "https://other.example.com")).toMatchObject({ valid: false });
    rows.set(user, [{ banned: true, banExpires: null }]);
    expect(await verify()).toMatchObject({ valid: false });
    rows.set(user, []);
    expect(await verify()).toMatchObject({ valid: false });
    expect(verifyApiKey).not.toHaveBeenCalled();
  });

  it("keeps an organization's key valid while the organization exists", async () => {
    await seedKey({ type: "organization", id: "org-1" });
    pluginResult = { valid: true, error: null, key: { id: "key-2", referenceId: "org-1", expiresAt: null } };
    rows.set(organization, [{ id: "org-1" }]);
    expect(await verify()).toMatchObject({ valid: true, ownerType: "organization", userId: null, organizationId: "org-1" });
    rows.set(organization, []);
    expect(await verify()).toMatchObject({ valid: false });
  });

  it("passes on the plugin's refusal, with Retry-After seconds when rate limited", async () => {
    await seedKey({ type: "user", id: "u1" });
    rows.set(user, [{ banned: false, banExpires: null }]);
    pluginResult = { valid: false, error: { code: "RATE_LIMITED", details: { tryAgainIn: 1500 } }, key: null };
    expect(await verify()).toEqual({ valid: false, error: "rate_limited", retryAfter: 2 });
  });
});
