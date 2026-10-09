import { describe, expect, it } from "vitest";

import { isExternalSignInPath, twoFactorStepURL } from "@ostiary/core/lib/security/external-sign-in";

describe("isExternalSignInPath", () => {
  it("covers every sign-in that skips the password step", () => {
    for (const path of [
      "/callback/github",
      "/oauth2/callback/custom",
      "/sign-in/social",
      "/one-tap/callback",
      "/sso/callback/acme",
      "/sso/callback",
      "/sso/saml2/sp/acs/acme",
      "/sso/saml2/callback/acme",
      "/verify-email",
    ]) {
      expect(isExternalSignInPath(path), path).toBe(true);
    }
  });

  it("leaves the password, code and second-step endpoints to the two-factor plugin", () => {
    for (const path of ["/sign-in/email", "/sign-in/username", "/sign-in/email-otp", "/two-factor/verify-totp", "/passkey/verify-authentication", "/get-session", "/link-social", undefined]) {
      expect(isExternalSignInPath(path), String(path)).toBe(false);
    }
  });
});

describe("twoFactorStepURL", () => {
  const base = "https://auth.example.com";

  it("continues to where the sign-in was going", () => {
    expect(twoFactorStepURL(base, { location: "/en/dashboard" })).toBe(
      "https://auth.example.com/two-factor?callbackURL=%2Fen%2Fdashboard",
    );
    expect(twoFactorStepURL(base, { location: "https://auth.example.com/en/dashboard?x=1" })).toBe(
      "https://auth.example.com/two-factor?callbackURL=%2Fen%2Fdashboard%3Fx%3D1",
    );
  });

  it("resumes an app's authorization request after the code, without asking to sign in again", () => {
    const url = new URL(
      twoFactorStepURL(base, {
        location: "/en/dashboard",
        oauthQuery: "response_type=code&client_id=abc&prompt=login+consent&state=s",
      }),
    );
    const callback = url.searchParams.get("callbackURL")!;
    expect(callback.startsWith("/api/auth/oauth2/authorize?")).toBe(true);
    const query = new URL(callback, base).searchParams;
    expect(query.get("client_id")).toBe("abc");
    expect(query.get("prompt")).toBe("consent");
    expect(query.get("state")).toBe("s");
  });

  it("never carries a destination on another origin", () => {
    expect(twoFactorStepURL(base, { location: "https://evil.example/x" })).toBe("https://auth.example.com/two-factor");
    expect(twoFactorStepURL(base, { location: "//evil.example/x" })).toBe("https://auth.example.com/two-factor");
    expect(twoFactorStepURL(base, { location: null })).toBe("https://auth.example.com/two-factor");
    for (const location of ["/\\evil.example/x", "/\t/evil.example", "/en/dashboard\r\n"]) {
      expect(twoFactorStepURL(base, { location })).toBe("https://auth.example.com/two-factor");
    }
  });
});
