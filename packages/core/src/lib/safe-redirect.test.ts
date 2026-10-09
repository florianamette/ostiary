import { describe, expect, it } from "vitest";

import { resolveSafeRedirect, safeRedirectTarget } from "@ostiary/core/lib/safe-redirect";

const AUTH = "https://auth.example.com";
const ADMIN = "https://admin.example.com";
const options = { origin: AUTH, allowedOrigins: [ADMIN] };
const FALLBACK = "/en/dashboard";

const follow = (raw: string | null | undefined) => safeRedirectTarget(raw, FALLBACK, options);

describe("safeRedirectTarget", () => {
  it.each([
    ["/en/dashboard", "/en/dashboard"],
    ["/en/dashboard#security", "/en/dashboard#security"],
    ["/en/device?user_code=ABCD-EFGH", "/en/device?user_code=ABCD-EFGH"],
    ["/api/auth/oauth2/authorize?client_id=x&redirect_uri=https%3A%2F%2Fapp.test%2Fcb", "/api/auth/oauth2/authorize?client_id=x&redirect_uri=https%3A%2F%2Fapp.test%2Fcb"],
    // Percent-encoded slashes and backslashes stay in the path: same origin.
    ["/%2F%2Fevil.com", "/%2F%2Fevil.com"],
    ["/%5Cevil.com", "/%5Cevil.com"],
    ["/en/../dashboard", "/dashboard"],
    [`${AUTH}/en/dashboard`, "/en/dashboard"],
    [`${ADMIN}/en/users/1?tab=sessions`, `${ADMIN}/en/users/1?tab=sessions`],
    ["HTTPS://ADMIN.EXAMPLE.COM/en", `${ADMIN}/en`],
  ])("follows %j", (raw, expected) => {
    expect(follow(raw)).toBe(expected);
  });

  it.each([
    // Empty or missing.
    [null],
    [undefined],
    [""],
    // Protocol-relative and their parser-normalized spellings.
    ["//evil.com"],
    ["//evil.com/en/dashboard"],
    ["/\\evil.com"],
    ["\\/evil.com"],
    ["\\\\evil.com"],
    ["/\\/evil.com"],
    ["/en/\\..\\..\\/evil.com"],
    // Tabs, newlines and other controls that URL parsing silently drops.
    ["/\t/evil.com"],
    ["/\n/evil.com"],
    ["/\r\n/evil.com"],
    ["/\u0000/evil.com"],
    ["/\u007f/evil.com"],
    ["/\u0085/evil.com"],
    ["/en/dashboard\r\nSet-Cookie: x=1"],
    // Leading or trailing whitespace (stripped by the parser).
    [" //evil.com"],
    [" /en/dashboard"],
    ["/en/dashboard "],
    ["\u000c/evil.com"],
    // Other origins, schemes and credentials.
    ["https://evil.com"],
    ["https://evil.com/en/dashboard"],
    ["https://auth.example.com.evil.com/"],
    ["https://auth.example.com@evil.com/"],
    ["https://user:pass@auth.example.com/en"],
    ["http://auth.example.com/en"],
    ["https://auth.example.com:8443/en"],
    ["javascript:alert(1)"],
    ["JavaScript:alert(document.domain)"],
    ["data:text/html,<script>alert(1)</script>"],
    ["vbscript:msgbox(1)"],
    ["mailto:a@example.com"],
    // Relative paths that are not paths.
    ["evil.com"],
    ["en/dashboard"],
    ["?next=/"],
    ["#top"],
    ["https:evil.com"],
    ["https:/evil.com"],
  ])("refuses %j", (raw) => {
    expect(follow(raw)).toBe(FALLBACK);
    expect(resolveSafeRedirect(raw, options)).toBeNull();
  });

  it("checks relative paths without knowing the current origin", () => {
    expect(safeRedirectTarget("/en/dashboard", FALLBACK)).toBe("/en/dashboard");
    expect(safeRedirectTarget("/\\evil.com", FALLBACK)).toBe(FALLBACK);
    expect(safeRedirectTarget("//evil.com", FALLBACK)).toBe(FALLBACK);
    // Absolute URLs need an allowed origin.
    expect(safeRedirectTarget(`${AUTH}/en`, FALLBACK)).toBe(FALLBACK);
  });

  it("ignores unusable allowed origins", () => {
    const loose = { origin: "not a url", allowedOrigins: [undefined, null, "", "also not a url"] };
    expect(safeRedirectTarget("https://evil.com", FALLBACK, loose)).toBe(FALLBACK);
    expect(safeRedirectTarget("/en/dashboard", FALLBACK, loose)).toBe("/en/dashboard");
  });

  it("resolves to a URL on the current origin for server redirects", () => {
    expect(resolveSafeRedirect("/en/dashboard?x=1", options)?.href).toBe(`${AUTH}/en/dashboard?x=1`);
    expect(resolveSafeRedirect(`${ADMIN}/en`, options)?.href).toBe(`${ADMIN}/en`);
  });
});
