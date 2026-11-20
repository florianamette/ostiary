import { describe, expect, it } from "vitest";

import {
  buildClientClaims,
  claimNeeds,
  CLIENT_RESERVED_CLAIMS,
  EXAMPLE_CLAIM_CONTEXT,
  MACHINE_CLAIM_CONTEXT,
  validateClientClaims,
  type ClientClaim,
} from "./policy";

const tenant = { name: "https://example.com/tenant", tokens: ["id_token", "access_token"], source: "static", value: "acme" };
const role = { name: "https://example.com/role", tokens: ["access_token", "userinfo"], source: "attribute", attribute: "user.role" };

describe("validateClientClaims", () => {
  it("accepts static values and allowed attributes, keeping the tokens in a fixed order", () => {
    const result = validateClientClaims([
      { ...tenant, tokens: ["access_token", "id_token", "access_token"] },
      role,
      { name: "plan", tokens: ["userinfo"], source: "static", value: { tier: "gold", seats: 5, features: ["sso", true] } },
    ]);
    expect(result).toEqual({
      ok: true,
      value: [
        { ...tenant, tokens: ["id_token", "access_token"] },
        role,
        { name: "plan", tokens: ["userinfo"], source: "static", value: { tier: "gold", seats: 5, features: ["sso", true] } },
      ],
    });
  });

  it("accepts an empty list", () => {
    expect(validateClientClaims([])).toEqual({ ok: true, value: [] });
  });

  it("trims names", () => {
    const result = validateClientClaims([{ ...tenant, name: "  tenant " }]);
    expect(result.ok && result.value[0]!.name).toBe("tenant");
  });

  it.each(["iss", "sub", "aud", "exp", "iat", "nbf", "jti", "nonce", "azp", "auth_time", "acr", "amr", "at_hash", "c_hash", "sid", "scope", "client_id", "cnf", "role", "email", "email_verified", "name", "picture", "active"])(
    "refuses the reserved claim %s",
    (name) => {
      const result = validateClientClaims([{ ...tenant, name }]);
      expect(result).toMatchObject({ ok: false, issue: { code: "nameReserved", values: { name } } });
    },
  );

  it("refuses a claim without a name", () => {
    expect(validateClientClaims([{ ...tenant, name: " " }])).toMatchObject({ ok: false, issue: { code: "nameMissing" } });
  });

  it.each(["1abc", "has space", "tenant!", "__proto__", "constructor", "x".repeat(201), "é"])("refuses the claim name %j", (name) => {
    const result = validateClientClaims([{ ...tenant, name }]);
    expect(result).toMatchObject({ ok: false, issue: { code: "nameInvalid" } });
  });

  it("refuses a name defined twice", () => {
    expect(validateClientClaims([tenant, { ...role, name: tenant.name }])).toMatchObject({
      ok: false,
      issue: { code: "nameDuplicate", values: { name: tenant.name } },
    });
  });

  it("refuses a claim without a token", () => {
    expect(validateClientClaims([{ ...tenant, tokens: [] }])).toMatchObject({ ok: false, issue: { code: "noTokens" } });
  });

  it("refuses unknown tokens and sources as a malformed definition", () => {
    expect(validateClientClaims([{ ...tenant, tokens: ["refresh_token"] }])).toMatchObject({ ok: false, issue: { code: "invalid" } });
    expect(validateClientClaims([{ ...tenant, source: "script", value: "return 1" }])).toMatchObject({ ok: false, issue: { code: "invalid" } });
    expect(validateClientClaims({ tenant: "acme" })).toMatchObject({ ok: false, issue: { code: "invalid" } });
    expect(validateClientClaims(null)).toMatchObject({ ok: false, issue: { code: "invalid" } });
  });

  it("refuses attributes outside the allow-list", () => {
    for (const attribute of ["user.password", "user.email", "account.accessToken", "session.token", "user.role.constructor"]) {
      expect(validateClientClaims([{ ...role, attribute }])).toMatchObject({ ok: false, issue: { code: "attributeUnknown" } });
    }
  });

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, [null], { a: null }, { __proto__: null, a: 1 }, [[[[[["deep"]]]]]]])(
    "refuses the static value %j",
    (value) => {
      expect(validateClientClaims([{ ...tenant, value }])).toMatchObject({ ok: false, issue: { code: "valueInvalid" } });
    },
  );

  it("refuses an object key that reaches the prototype", () => {
    const value = JSON.parse('{"__proto__": {"polluted": true}}') as unknown;
    expect(validateClientClaims([{ ...tenant, value }])).toMatchObject({ ok: false, issue: { code: "valueInvalid" } });
  });

  it("refuses more than 20 claims", () => {
    const claims = Array.from({ length: 21 }, (_, i) => ({ ...tenant, name: `claim_${i}` }));
    expect(validateClientClaims(claims)).toMatchObject({ ok: false, issue: { code: "tooMany", values: { max: 20 } } });
    expect(validateClientClaims(claims.slice(0, 20)).ok).toBe(true);
  });

  it("refuses more than 4 KB", () => {
    expect(validateClientClaims([{ ...tenant, value: "x".repeat(4100) }])).toMatchObject({
      ok: false,
      issue: { code: "tooLarge", values: { kilobytes: 4 } },
    });
  });

  it("reserves at least the claims the server and Ostiary set", () => {
    for (const name of ["iss", "sub", "aud", "exp", "iat", "nbf", "jti", "nonce", "azp", "auth_time", "acr", "amr", "at_hash", "c_hash", "s_hash", "sid", "scope", "client_id", "cnf", "role", "name", "picture", "email", "email_verified"]) {
      expect(CLIENT_RESERVED_CLAIMS).toContain(name);
    }
  });
});

describe("buildClientClaims", () => {
  const claims: ClientClaim[] = [
    { name: "tenant", tokens: ["id_token", "access_token", "userinfo"], source: "static", value: "acme" },
    { name: "app_role", tokens: ["access_token"], source: "attribute", attribute: "user.role" },
    { name: "verified", tokens: ["id_token"], source: "attribute", attribute: "user.email_verified" },
    { name: "handle", tokens: ["userinfo"], source: "attribute", attribute: "user.username" },
    { name: "mfa", tokens: ["access_token"], source: "attribute", attribute: "user.two_factor_enabled" },
    { name: "org_id", tokens: ["access_token"], source: "attribute", attribute: "organization.id" },
    { name: "org_slug", tokens: ["access_token"], source: "attribute", attribute: "organization.slug" },
    { name: "org_role", tokens: ["access_token"], source: "attribute", attribute: "organization.role" },
    { name: "orgs", tokens: ["id_token"], source: "attribute", attribute: "organizations" },
  ];

  it("puts each claim only in its tokens, with values from the user and session", () => {
    expect(buildClientClaims(claims, "access_token", EXAMPLE_CLAIM_CONTEXT)).toEqual({
      tenant: "acme",
      app_role: "user",
      mfa: true,
      org_id: "org_8Kq2",
      org_slug: "acme",
      org_role: "admin",
    });
    expect(buildClientClaims(claims, "id_token", EXAMPLE_CLAIM_CONTEXT)).toEqual({
      tenant: "acme",
      verified: true,
      orgs: [
        { id: "org_8Kq2", slug: "acme", role: "admin" },
        { id: "org_3Tz9", slug: "globex", role: "member" },
      ],
    });
    expect(buildClientClaims(claims, "userinfo", EXAMPLE_CLAIM_CONTEXT)).toEqual({ tenant: "acme", handle: "ada" });
  });

  it("leaves out user-derived claims without a user (client credentials)", () => {
    expect(buildClientClaims(claims, "access_token", MACHINE_CLAIM_CONTEXT)).toEqual({ tenant: "acme" });
  });

  it("leaves out the organization claims without an active organization, and missing values", () => {
    const context = {
      user: { role: null, emailVerified: false, username: null, twoFactorEnabled: false },
      organization: null,
      organizations: [],
    };
    expect(buildClientClaims(claims, "access_token", context)).toEqual({ tenant: "acme", mfa: false });
    expect(buildClientClaims(claims, "id_token", context)).toEqual({ tenant: "acme", verified: false, orgs: [] });
  });

  it("caps the organization list", () => {
    const organizations = Array.from({ length: 60 }, (_, i) => ({ id: `org_${i}`, slug: `o${i}`, role: "member" }));
    const built = buildClientClaims(claims, "id_token", { ...EXAMPLE_CLAIM_CONTEXT, organizations });
    expect(built.orgs).toHaveLength(50);
  });

  it("skips reserved names even when stored", () => {
    const stored = [{ name: "sub", tokens: ["access_token"], source: "static", value: "someone-else" }] as ClientClaim[];
    expect(buildClientClaims(stored, "access_token", EXAMPLE_CLAIM_CONTEXT)).toEqual({});
  });

  it("says which context a token needs", () => {
    expect(claimNeeds(claims, "userinfo")).toEqual({ user: true, organization: false, organizations: false });
    expect(claimNeeds(claims, "access_token")).toEqual({ user: true, organization: true, organizations: false });
    expect(claimNeeds(claims, "id_token")).toEqual({ user: true, organization: false, organizations: true });
    expect(claimNeeds([claims[0]!], "access_token")).toEqual({ user: false, organization: false, organizations: false });
  });
});
