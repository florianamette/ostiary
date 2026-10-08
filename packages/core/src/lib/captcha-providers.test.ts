import { describe, expect, it } from "vitest";

import {
  CAPTCHA_PROTECTED_PATHS,
  CAPTCHA_PROVIDERS,
  CAPTCHA_WIDGETS,
  captchaCspSources,
} from "@ostiary/core/lib/captcha-providers";
import { envSchema } from "@ostiary/core/lib/env";

const baseEnv = {
  DATABASE_URL: "postgresql://localhost:5432/test",
  BETTER_AUTH_SECRET: "01234567890123456789012345678901",
};

describe("captcha CSP", () => {
  it("adds nothing when captcha is off", () => {
    expect(captchaCspSources(undefined)).toEqual({ script: [], frame: [], style: [], connect: [] });
    expect(captchaCspSources("captchafox")).toEqual({ script: [], frame: [], style: [], connect: [] });
  });

  it("adds only the configured provider's origins", () => {
    const turnstile = captchaCspSources("cloudflare-turnstile");
    expect(turnstile.script).toEqual(["https://challenges.cloudflare.com"]);
    expect(turnstile.frame).toEqual(["https://challenges.cloudflare.com"]);
    expect(JSON.stringify(turnstile)).not.toMatch(/hcaptcha|google/);
  });

  it("loads every widget script from an origin its CSP allows", () => {
    for (const provider of CAPTCHA_PROVIDERS) {
      const src = new URL(CAPTCHA_WIDGETS[provider].script("cb", "en"));
      const allowed = captchaCspSources(provider).script.some((source) => {
        const pattern = new URL(source.replace("*.", "wildcard."));
        const hostMatches = source.includes("*.")
          ? src.hostname.endsWith(pattern.hostname.replace("wildcard", ""))
          : src.hostname === pattern.hostname;
        return hostMatches && src.pathname.startsWith(pattern.pathname);
      });
      expect(allowed, provider).toBe(true);
      expect(src.searchParams.get("render")).toBe("explicit");
      expect(src.searchParams.get("onload")).toBe("cb");
    }
  });

  it("protects the password, sign-up, reset and sign-in code endpoints", () => {
    expect(CAPTCHA_PROTECTED_PATHS).toEqual(
      expect.arrayContaining([
        "/sign-up/email",
        "/sign-in/email",
        "/sign-in/username",
        "/request-password-reset",
        "/email-otp/send-verification-otp",
      ]),
    );
  });
});

describe("captcha environment", () => {
  it("is off when no variable is set, including empty ones", () => {
    const parsed = envSchema.safeParse({ ...baseEnv, CAPTCHA_PROVIDER: "", CAPTCHA_SITE_KEY: "", CAPTCHA_SECRET_KEY: "" });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.CAPTCHA_PROVIDER).toBeUndefined();
  });

  it("needs the provider, site key and secret key together", () => {
    const parsed = envSchema.safeParse({ ...baseEnv, CAPTCHA_PROVIDER: "cloudflare-turnstile" });
    expect(parsed.success).toBe(false);
    expect(Object.keys(parsed.error?.flatten().fieldErrors ?? {}).sort()).toEqual(["CAPTCHA_SECRET_KEY", "CAPTCHA_SITE_KEY"]);
  });

  it("accepts a supported provider only", () => {
    const keys = { CAPTCHA_SITE_KEY: "site", CAPTCHA_SECRET_KEY: "secret" };
    expect(envSchema.safeParse({ ...baseEnv, ...keys, CAPTCHA_PROVIDER: "hcaptcha" }).success).toBe(true);
    expect(envSchema.safeParse({ ...baseEnv, ...keys, CAPTCHA_PROVIDER: "vercel-botid" }).success).toBe(false);
  });
});
