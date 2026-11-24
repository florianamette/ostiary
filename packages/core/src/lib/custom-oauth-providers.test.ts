import { describe, expect, it } from "vitest";

import { checkDiscovery, isCustomProviderId } from "@ostiary/core/lib/custom-oauth-providers";

describe("isCustomProviderId", () => {
  it("accepts oidc-<slug> and nothing else", () => {
    expect(isCustomProviderId("oidc-keycloak")).toBe(true);
    expect(isCustomProviderId("oidc-acme-sso-2")).toBe(true);
    expect(isCustomProviderId("oidc-")).toBe(false);
    expect(isCustomProviderId("oidc--x")).toBe(false);
    expect(isCustomProviderId("oidc-Keycloak")).toBe(false);
    expect(isCustomProviderId("google")).toBe(false);
    expect(isCustomProviderId(`oidc-${"a".repeat(33)}`)).toBe(false);
  });
});

describe("checkDiscovery", () => {
  it("refuses a discovery URL Ostiary may not fetch, before any request", async () => {
    expect(await checkDiscovery("http://sso.example.com/.well-known/openid-configuration", false)).toMatchObject({ ok: false });
    expect(await checkDiscovery("https://10.0.0.1/.well-known/openid-configuration", false)).toMatchObject({ ok: false });
    expect(await checkDiscovery("https://localhost/.well-known/openid-configuration", false)).toMatchObject({ ok: false });
  });
});
