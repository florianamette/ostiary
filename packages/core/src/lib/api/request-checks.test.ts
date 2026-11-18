import { describe, expect, it } from "vitest";

import { isAllowedOrigin, isJsonContentType, isUniqueViolation, originOf } from "@ostiary/core/lib/api/request-checks";

const ADMIN = "https://admin.example.com";

function request(method: string, headers: Record<string, string> = {}) {
  return new Request(`${ADMIN}/api/admin/oauth-clients`, { method, headers });
}

describe("isAllowedOrigin", () => {
  it("lets reads through", () => {
    expect(isAllowedOrigin(request("GET"), ADMIN)).toBe(true);
  });

  it("accepts writes from the admin origin only", () => {
    expect(isAllowedOrigin(request("POST", { origin: ADMIN }), ADMIN)).toBe(true);
    expect(isAllowedOrigin(request("PATCH", { origin: "https://app.example.com" }), ADMIN)).toBe(false);
    expect(isAllowedOrigin(request("DELETE", { origin: "null" }), ADMIN)).toBe(false);
  });

  it("refuses a write without Origin, or when no origin is configured", () => {
    expect(isAllowedOrigin(request("POST"), ADMIN)).toBe(false);
    expect(isAllowedOrigin(request("POST", { origin: ADMIN }), null)).toBe(false);
  });
});

describe("isJsonContentType", () => {
  it("accepts application/json with parameters", () => {
    expect(isJsonContentType(request("POST", { "content-type": "application/json; charset=utf-8" }))).toBe(true);
  });

  it("refuses bodies another site can send without a preflight", () => {
    expect(isJsonContentType(request("POST", { "content-type": "text/plain" }))).toBe(false);
    expect(isJsonContentType(request("POST", { "content-type": "application/x-www-form-urlencoded" }))).toBe(false);
    expect(isJsonContentType(request("POST"))).toBe(false);
  });
});

describe("originOf", () => {
  it("reads a URL's origin", () => {
    expect(originOf("https://admin.example.com/")).toBe(ADMIN);
    expect(originOf(undefined)).toBeNull();
    expect(originOf("not a url")).toBeNull();
  });
});

describe("isUniqueViolation", () => {
  it("finds 23505 on the error or its cause", () => {
    expect(isUniqueViolation({ code: "23505", constraint: "sso_provider_domain_lower_idx" }, "domain")).toBe(true);
    expect(isUniqueViolation(new Error("Failed query", { cause: { code: "23505" } }), "domain")).toBe(true);
  });

  it("ignores other errors and other constraints", () => {
    expect(isUniqueViolation({ code: "23505", constraint: "sso_provider_provider_id_unique" }, "domain")).toBe(false);
    expect(isUniqueViolation({ code: "23503" }, "domain")).toBe(false);
    expect(isUniqueViolation(null, "domain")).toBe(false);
  });
});
