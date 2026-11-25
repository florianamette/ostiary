import { describe, expect, it } from "vitest";

import { builtInRolePermissions, CUSTOM_ROLE_NAME, normalizeRolePermissions, parseRolePermissions } from "@ostiary/core/lib/organization-access";

describe("normalizeRolePermissions", () => {
  it("keeps known actions, in the statements' order, and drops empty resources", () => {
    expect(normalizeRolePermissions({ invitation: ["cancel", "create"], member: [], apiKey: ["read"] })).toEqual({
      invitation: ["create", "cancel"],
      apiKey: ["read"],
    });
  });

  it("refuses unknown resources or actions, and anything that is not an object of lists", () => {
    expect(normalizeRolePermissions({ billing: ["read"] })).toBeNull();
    expect(normalizeRolePermissions({ member: ["promote"] })).toBeNull();
    expect(normalizeRolePermissions({ member: "create" })).toBeNull();
    expect(normalizeRolePermissions(["member"])).toBeNull();
    expect(normalizeRolePermissions(null)).toBeNull();
    expect(normalizeRolePermissions(JSON.parse('{"__proto__": ["read"]}'))).toBeNull();
    expect(normalizeRolePermissions({ constructor: ["read"] })).toBeNull();
  });

  it("reads stored permissions, and nothing from a broken value", () => {
    expect(parseRolePermissions('{"team":["create"]}')).toEqual({ team: ["create"] });
    expect(parseRolePermissions("not json")).toEqual({});
  });
});

describe("roles", () => {
  it("gives the built-in roles Better Auth's permissions plus API keys for owners and admins", () => {
    expect(builtInRolePermissions("member")).toMatchObject({ ac: ["read"] });
    expect(builtInRolePermissions("admin").apiKey).toEqual(["create", "read", "update", "delete"]);
    expect(builtInRolePermissions("member").apiKey).toBeUndefined();
  });

  it("names custom roles plainly", () => {
    for (const ok of ["billing-manager", "ops_lead", "qa"]) expect(CUSTOM_ROLE_NAME.test(ok), ok).toBe(true);
    for (const bad of ["a", "Billing", "1st", "has space", "x".repeat(33)]) expect(CUSTOM_ROLE_NAME.test(bad), bad).toBe(false);
  });
});
