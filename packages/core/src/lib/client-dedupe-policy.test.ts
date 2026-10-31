import { describe, expect, it } from "vitest";

import {
  neverUsedFor,
  planDuplicateCleanup,
  publicClientDedupeKey,
  registrationRequestDedupeFields,
  type DedupeClientFields,
} from "@ostiary/core/lib/client-dedupe-policy";

const SCOPES = ["openid", "profile", "email", "offline_access"];

/** What Claude sends to /oauth2/register (after the anonymous coercion to "none"). */
const claude = {
  client_name: "Claude",
  redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
  scope: "openid profile email offline_access",
};

/** The row Better Auth stores for `claude`. */
const stored: DedupeClientFields = {
  name: "Claude",
  redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
  grantTypes: ["authorization_code", "refresh_token"],
  responseTypes: ["code"],
  scopes: SCOPES,
  softwareId: null,
  softwareVersion: null,
  applicationType: "web",
  postLogoutRedirectUris: null,
  tokenEndpointAuthMethod: "none",
  clientSecret: null,
  userId: null,
  referenceId: null,
};

const keyOf = (body: Record<string, unknown>) => {
  const fields = registrationRequestDedupeFields(body, SCOPES);
  return fields && publicClientDedupeKey(fields);
};

describe("publicClientDedupeKey", () => {
  it("matches the same registration, whatever the order of its lists", () => {
    expect(keyOf(claude)).toBe(publicClientDedupeKey(stored));
    expect(
      keyOf({
        ...claude,
        redirect_uris: [...claude.redirect_uris].reverse(),
        grant_types: ["refresh_token", "authorization_code"],
        scope: "openid email",
      }),
    ).toBe(publicClientDedupeKey(stored));
  });

  it("applies Better Auth's defaults to the request", () => {
    const minimal: Record<string, unknown> = { ...claude };
    delete minimal.grant_types;
    delete minimal.response_types;
    expect(keyOf(minimal)).toBe(publicClientDedupeKey({ ...stored, grantTypes: ["authorization_code"] }));
  });

  it("differs when the redirect URIs differ", () => {
    expect(keyOf({ ...claude, redirect_uris: ["https://claude.ai/other"] })).not.toBe(publicClientDedupeKey(stored));
    expect(
      keyOf({ ...claude, redirect_uris: [...claude.redirect_uris, "https://claude.ai/other"] }),
    ).not.toBe(publicClientDedupeKey(stored));
  });

  it("differs on the name, grants, response types, scopes, software id and version", () => {
    const base = publicClientDedupeKey(stored);
    for (const change of [
      { name: "mcp-verify" },
      { grantTypes: ["authorization_code"] },
      { responseTypes: [] },
      { scopes: ["openid"] },
      { softwareId: "claude" },
      { softwareVersion: "2" },
      { applicationType: "native" },
      { postLogoutRedirectUris: ["https://claude.ai/"] },
    ]) {
      expect(publicClientDedupeKey({ ...stored, ...change }), JSON.stringify(change)).not.toBe(base);
    }
  });

  it("is null for confidential and owned clients", () => {
    expect(publicClientDedupeKey({ ...stored, tokenEndpointAuthMethod: "client_secret_basic" })).toBeNull();
    expect(publicClientDedupeKey({ ...stored, clientSecret: "hashed" })).toBeNull();
    expect(publicClientDedupeKey({ ...stored, userId: "usr_1" })).toBeNull();
    expect(publicClientDedupeKey({ ...stored, referenceId: "ostiary:platform" })).toBeNull();
  });
});

describe("registrationRequestDedupeFields", () => {
  it("leaves confidential registrations to Better Auth", () => {
    expect(registrationRequestDedupeFields({ ...claude, token_endpoint_auth_method: "client_secret_basic" }, SCOPES)).toBeNull();
    const omitted: Record<string, unknown> = { ...claude };
    delete omitted.token_endpoint_auth_method;
    expect(registrationRequestDedupeFields(omitted, SCOPES)).toBeNull();
  });

  it("leaves requests with fields the key does not cover to Better Auth", () => {
    for (const extra of [
      { resources: ["https://api.example.test"] },
      { jwks_uri: "https://claude.ai/jwks" },
      { software_statement: "eyJ..." },
      { require_pkce: false },
      { subject_type: "pairwise" },
      { backchannel_logout_uri: "https://claude.ai/logout" },
    ]) {
      expect(registrationRequestDedupeFields({ ...claude, ...extra }, SCOPES), JSON.stringify(extra)).toBeNull();
    }
  });

  it("leaves malformed requests and scopes outside the allowed list to Better Auth (which refuses them)", () => {
    expect(registrationRequestDedupeFields({ ...claude, redirect_uris: "https://claude.ai/cb" }, SCOPES)).toBeNull();
    expect(registrationRequestDedupeFields({ ...claude, redirect_uris: [] }, SCOPES)).toBeNull();
    expect(registrationRequestDedupeFields({ ...claude, client_name: 3 }, SCOPES)).toBeNull();
    expect(registrationRequestDedupeFields({ ...claude, scope: "openid admin" }, SCOPES)).toBeNull();
    expect(registrationRequestDedupeFields(null, SCOPES)).toBeNull();
  });
});

describe("planDuplicateCleanup", () => {
  const day = (n: number) => new Date(Date.UTC(2026, 9, n));
  const client = (clientId: string, key: string, lastActivityAt: Date | null, liveTokens = 0, createdAt = day(1)) => ({
    clientId,
    key,
    createdAt,
    lastActivityAt,
    liveTokens,
  });

  it("keeps the most recently used client and removes the unused others", () => {
    const [plan] = planDuplicateCleanup([
      client("old", "claude", day(2)),
      client("recent", "claude", day(20)),
      client("never", "claude", null),
    ]);
    expect(plan).toEqual({ key: "claude", keep: "recent", remove: ["old", "never"], inUse: [] });
  });

  it("leaves duplicates that still hold live tokens, and reports them", () => {
    const [plan] = planDuplicateCleanup([
      client("recent", "claude", day(20), 1),
      client("signed-in", "claude", day(10), 2),
      client("unused", "claude", null),
    ]);
    expect(plan).toMatchObject({ keep: "recent", remove: ["unused"], inUse: ["signed-in"] });
  });

  it("keeps the newest registration when none was used, and ignores clients without duplicates", () => {
    const plans = planDuplicateCleanup([
      client("first", "claude", null, 0, day(1)),
      client("second", "claude", null, 0, day(5)),
      client("alone", "mcp-verify", null),
    ]);
    expect(plans).toEqual([{ key: "claude", keep: "second", remove: ["first"], inUse: [] }]);
  });
});

describe("neverUsedFor", () => {
  const now = new Date(Date.UTC(2026, 9, 31));
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  it("is true only for clients without any use, older than the given days", () => {
    const base = { clientId: "c", lastActivityAt: null, liveTokens: 0 };
    expect(neverUsedFor({ ...base, createdAt: daysAgo(31) }, 30, now)).toBe(true);
    expect(neverUsedFor({ ...base, createdAt: daysAgo(29) }, 30, now)).toBe(false);
    expect(neverUsedFor({ ...base, createdAt: daysAgo(31), lastActivityAt: daysAgo(31) }, 30, now)).toBe(false);
    expect(neverUsedFor({ ...base, createdAt: null }, 30, now)).toBe(false);
  });
});
