import { describe, expect, it } from "vitest";

import { linksOfClient } from "@ostiary/core/lib/oauth-resource-access";
import {
  CUSTOM_CLAIMS_MAX_BYTES,
  parseCustomClaims,
  parseLifetime,
  parseTokenSettings,
  resourceAccess,
} from "@ostiary/core/lib/oauth-resource-policy";

const minutes = { field: "access" as const, unit: "minutes", unitSeconds: 60, max: 3600, label: "The access token lifetime" };

describe("resourceAccess", () => {
  it("is open to every application unless the metadata says linked", () => {
    expect(resourceAccess(null)).toBe("all");
    expect(resourceAccess({ scopes: ["a"] })).toBe("all");
    expect(resourceAccess({ access: "all" })).toBe("all");
    expect(resourceAccess({ access: "something" })).toBe("all");
    expect(resourceAccess({ access: "linked" })).toBe("linked");
  });
});

describe("parseLifetime", () => {
  it("treats empty as the default", () => {
    expect(parseLifetime("  ", minutes)).toEqual({ ok: true, value: null });
  });

  it("converts to whole seconds", () => {
    expect(parseLifetime("15", minutes)).toEqual({ ok: true, value: 900 });
    expect(parseLifetime("1.5", minutes)).toEqual({ ok: true, value: 90 });
  });

  it("refuses values that are not positive numbers", () => {
    for (const raw of ["0", "-5", "abc", "Infinity"]) {
      const result = parseLifetime(raw, minutes);
      expect(result.ok).toBe(false);
    }
  });

  it("refuses less than a minute", () => {
    const result = parseLifetime("0.5", minutes);
    expect(result).toMatchObject({ ok: false, error: "The access token lifetime must be at least one minute." });
  });

  it("refuses more than the server default, which Better Auth would ignore", () => {
    const result = parseLifetime("61", minutes);
    expect(result).toMatchObject({ ok: false, error: "The access token lifetime can be at most 60 minutes, the server default." });
    expect(parseLifetime("60", minutes)).toEqual({ ok: true, value: 3600 });
  });
});

describe("parseCustomClaims", () => {
  it("treats empty as none", () => {
    expect(parseCustomClaims("")).toEqual({ ok: true, value: null });
    expect(parseCustomClaims("{}")).toEqual({ ok: true, value: null });
  });

  it("accepts a JSON object with nested values", () => {
    expect(parseCustomClaims('{"tenant": "acme", "limits": {"rpm": 10}}')).toEqual({
      ok: true,
      value: { tenant: "acme", limits: { rpm: 10 } },
    });
  });

  it("refuses invalid JSON and non-objects", () => {
    for (const raw of ["{tenant: acme}", "[1, 2]", '"acme"', "42", "null"]) {
      expect(parseCustomClaims(raw).ok).toBe(false);
    }
  });

  it("refuses reserved claims, naming them", () => {
    const one = parseCustomClaims('{"sub": "x", "tenant": "acme"}');
    expect(one.ok).toBe(false);
    if (!one.ok) expect(one.error).toMatch(/^"sub" is a reserved claim: the server sets it\./);
    const several = parseCustomClaims('{"aud": "x", "role": "admin"}');
    expect(several.ok).toBe(false);
    if (!several.ok) expect(several.error).toMatch(/^"aud", "role" are reserved claims/);
  });

  it("refuses an empty claim name", () => {
    expect(parseCustomClaims('{" ": 1}').ok).toBe(false);
  });

  it("refuses claims over the size limit", () => {
    const big = JSON.stringify({ blob: "x".repeat(CUSTOM_CLAIMS_MAX_BYTES) });
    expect(parseCustomClaims(big).ok).toBe(false);
  });
});

describe("parseTokenSettings", () => {
  it("maps the form to Better Auth's resource fields", () => {
    expect(
      parseTokenSettings({ accessTokenMinutes: "10", refreshTokenDays: "7", customClaims: '{"tier": "gold"}', dpopRequired: true }),
    ).toEqual({
      ok: true,
      value: {
        accessTokenTtl: 600,
        refreshTokenTtl: 7 * 86_400,
        customClaims: { tier: "gold" },
        dpopBoundAccessTokensRequired: true,
      },
    });
  });

  it("clears every setting when the form is empty", () => {
    expect(parseTokenSettings({ accessTokenMinutes: "", refreshTokenDays: "", customClaims: "", dpopRequired: false })).toEqual({
      ok: true,
      value: { accessTokenTtl: null, refreshTokenTtl: null, customClaims: null, dpopBoundAccessTokensRequired: false },
    });
  });

  it("refuses a refresh token lifetime over 30 days", () => {
    const result = parseTokenSettings({ accessTokenMinutes: "", refreshTokenDays: "31", customClaims: "", dpopRequired: false });
    expect(result).toMatchObject({ ok: false, error: "The refresh token lifetime can be at most 30 days, the server default." });
  });
});

describe("linksOfClient", () => {
  it("matches Better Auth's per-client linkage check", () => {
    expect(linksOfClient({ model: "oauthClientResource", where: [{ field: "clientId", value: "abc" }] })).toBe("abc");
  });

  it("leaves the introspection lookup (filtered by resource) and other models alone", () => {
    expect(
      linksOfClient({
        model: "oauthClientResource",
        where: [
          { field: "clientId", value: "abc" },
          { field: "resourceId", operator: "in", value: ["https://api.example.com"] },
        ],
        limit: 1,
      }),
    ).toBeNull();
    expect(linksOfClient({ model: "oauthClientResource", where: [{ field: "resourceId", value: "https://api.example.com" }] })).toBeNull();
    expect(linksOfClient({ model: "oauthClient", where: [{ field: "clientId", value: "abc" }] })).toBeNull();
    expect(linksOfClient({ model: "oauthClientResource", where: [{ field: "clientId", operator: "ne", value: "abc" }] })).toBeNull();
  });
});
