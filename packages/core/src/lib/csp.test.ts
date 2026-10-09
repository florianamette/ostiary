import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, createCspNonce } from "@ostiary/core/lib/csp";

const directive = (csp: string, name: string) =>
  csp
    .split("; ")
    .find((d) => d.startsWith(`${name} `))
    ?.split(" ")
    .slice(1) ?? [];

describe("contentSecurityPolicy", () => {
  it("allows only nonced scripts on pages, no eval or inline script in production", () => {
    const csp = contentSecurityPolicy({ nonce: "abc123==" });
    const script = directive(csp, "script-src");
    expect(script).toEqual(["'self'", "'nonce-abc123=='", "'strict-dynamic'"]);
    expect(csp).not.toContain("'unsafe-eval'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(csp, "base-uri")).toEqual(["'self'"]);
  });

  it("keeps a fixed policy without inline scripts for routes the proxy skips", () => {
    const script = directive(contentSecurityPolicy(), "script-src");
    expect(script).toEqual(["'self'"]);
  });

  it("allows eval in development only", () => {
    expect(directive(contentSecurityPolicy({ nonce: "n", dev: true }), "script-src")).toContain("'unsafe-eval'");
  });

  it("adds Google One Tap's sources only where asked", () => {
    const plain = contentSecurityPolicy({ nonce: "n" });
    expect(plain).not.toContain("accounts.google.com");
    expect(directive(plain, "frame-src")).toEqual([]);
    const signIn = contentSecurityPolicy({ nonce: "n", googleOneTap: true });
    expect(directive(signIn, "script-src")).toContain("https://accounts.google.com/gsi/client");
    expect(directive(signIn, "frame-src")).toEqual(["https://accounts.google.com/gsi/"]);
    expect(directive(signIn, "connect-src")).toContain("https://accounts.google.com/gsi/");
    expect(directive(signIn, "style-src")).toContain("https://accounts.google.com/gsi/style");
  });

  it("adds the captcha provider's sources", () => {
    const csp = contentSecurityPolicy({ nonce: "n", captchaProvider: "cloudflare-turnstile" });
    expect(directive(csp, "script-src")).toContain("https://challenges.cloudflare.com");
    expect(directive(csp, "frame-src")).toEqual(["https://challenges.cloudflare.com"]);
  });
});

describe("createCspNonce", () => {
  it("returns 128 random bits, base64, different every time", () => {
    const nonces = new Set(Array.from({ length: 50 }, createCspNonce));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) {
      expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
      expect(Buffer.from(nonce, "base64")).toHaveLength(16);
    }
  });
});
