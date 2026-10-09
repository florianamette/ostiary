import { generateKeyPairSync, verify } from "node:crypto";
import { socialProviderList, socialProviders } from "better-auth/social-providers";
import { describe, expect, it } from "vitest";

import { PROVIDER_MARKS } from "@ostiary/core/components/brand/social-provider-marks";
import {
  appleClientSecret,
  buildProviderOptions,
  invalidProviderField,
  missingProviderFields,
  providerFieldKeys,
} from "@ostiary/core/lib/social-provider-config";
import { SOCIAL_PROVIDER_META, SOCIAL_PROVIDERS, socialCallbackUrl } from "@ostiary/core/lib/social-provider-meta";
import { openSecret, sealSecret } from "@ostiary/core/lib/secret-box";

const ecKey = () =>
  generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();

/** Fake but well-formed values for every field of a provider. */
function sampleValues(id: (typeof SOCIAL_PROVIDERS)[number]) {
  const values: Record<string, string> = {};
  for (const field of SOCIAL_PROVIDER_META[id].fields) {
    if (field.optional) continue;
    values[field.key] = field.options?.[0] ?? `test-${field.key}`;
  }
  if (id === "apple") values.privateKey = ecKey();
  if (id === "cognito") Object.assign(values, { domain: "app.auth.eu-west-1.amazoncognito.com", region: "eu-west-1", userPoolId: "eu-west-1_abc" });
  return values;
}

describe("social provider registry", () => {
  it("lists every Better Auth built-in provider, and only those", () => {
    expect([...SOCIAL_PROVIDERS].sort()).toEqual([...socialProviderList].sort());
  });

  it("has a brand mark for every provider but the two without a free one", () => {
    const missing = SOCIAL_PROVIDERS.filter((id) => !PROVIDER_MARKS[id]);
    expect(missing).toEqual(["paybin", "polar"]);
  });

  it("builds the callback URL Better Auth uses", () => {
    expect(socialCallbackUrl("https://auth.example.com/", "google")).toBe("https://auth.example.com/api/auth/callback/google");
  });

  it.each(SOCIAL_PROVIDERS)("%s: builds options Better Auth accepts and an authorization URL", async (id) => {
    const options = buildProviderOptions(id, sampleValues(id));
    const provider = (socialProviders[id] as unknown as (o: unknown) => {
      id: string;
      createAuthorizationURL: (data: object) => Promise<URL> | URL;
    })(options);
    expect(provider.id).toBe(id);
    const url = await provider.createAuthorizationURL({
      state: "state",
      codeVerifier: "a".repeat(64),
      redirectURI: socialCallbackUrl("https://auth.example.com", id),
    });
    expect(new URL(url.toString()).protocol).toBe("https:");
    expect(url.toString()).toContain(encodeURIComponent(socialCallbackUrl("https://auth.example.com", id)));
  });
});

describe("buildProviderOptions", () => {
  it("refuses missing required fields", () => {
    expect(missingProviderFields("google", { clientId: "x" })).toEqual(["clientSecret"]);
    expect(() => buildProviderOptions("google", { clientId: "x" })).toThrow(/clientSecret/);
  });

  it("drops empty optional fields and applies defaults", () => {
    expect(buildProviderOptions("paypal", { clientId: "a", clientSecret: "b", environment: "" })).toEqual({
      clientId: "a",
      clientSecret: "b",
      environment: "live",
    });
    expect(buildProviderOptions("microsoft", { clientId: "a", clientSecret: "b", tenantId: " " })).toEqual({ clientId: "a", clientSecret: "b" });
  });

  it("turns off implicit sign-up when sign-up is not allowed", () => {
    expect(buildProviderOptions("github", { clientId: "a", clientSecret: "b" }, { allowSignUp: false })).toMatchObject({
      disableImplicitSignUp: true,
    });
  });

  it("treats Cognito's email_verified as verified only when it is true or \"true\"", async () => {
    const base = { clientId: "a", domain: "x.auth.eu-west-1.amazoncognito.com", region: "eu-west-1", userPoolId: "p" };
    const map = buildProviderOptions("cognito", base).mapProfileToUser as (p: Record<string, unknown>) => Promise<{ emailVerified: boolean }>;
    expect((await map({ email_verified: "false" })).emailVerified).toBe(false);
    expect((await map({ email_verified: "False" })).emailVerified).toBe(false);
    expect((await map({})).emailVerified).toBe(false);
    expect((await map({ email_verified: "true" })).emailVerified).toBe(true);
    expect((await map({ email_verified: true })).emailVerified).toBe(true);
  });

  it("asks Cognito for the client secret only when there is one", () => {
    const base = { clientId: "a", domain: "https://x.auth.eu-west-1.amazoncognito.com", region: "eu-west-1", userPoolId: "p" };
    expect(buildProviderOptions("cognito", base)).toMatchObject({ requireClientSecret: false, domain: "x.auth.eu-west-1.amazoncognito.com" });
    expect(buildProviderOptions("cognito", { ...base, clientSecret: "s" })).toMatchObject({ requireClientSecret: true });
  });

  it("uses TikTok's client key instead of a client ID", () => {
    expect(providerFieldKeys("tiktok")).toEqual({ plain: ["buttonName", "clientKey"], secret: ["clientSecret"] });
    expect(buildProviderOptions("tiktok", { clientKey: "k", clientSecret: "s" })).toEqual({ clientKey: "k", clientSecret: "s" });
  });

  it("signs Apple's client secret with the key and keeps the key out of the options", () => {
    const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const options = buildProviderOptions("apple", { clientId: "com.example.web", teamId: "TEAM123456", keyId: "KEY1234567", privateKey });
    expect(Object.keys(options).sort()).toEqual(["clientId", "clientSecret"]);
    const [header, payload, signature] = String(options.clientSecret).split(".");
    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY1234567" });
    expect(JSON.parse(Buffer.from(payload!, "base64url").toString())).toMatchObject({
      iss: "TEAM123456",
      sub: "com.example.web",
      aud: "https://appleid.apple.com",
    });
    const valid = verify(
      "sha256",
      Buffer.from(`${header}.${payload}`),
      { key: pair.publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature!, "base64url"),
    );
    expect(valid).toBe(true);
  });

  it("keeps Apple's client secret under six months", () => {
    const now = Date.UTC(2026, 0, 1);
    const jwt = appleClientSecret({ teamId: "T", keyId: "K", privateKey: ecKey(), clientId: "c" }, now);
    const { iat, exp } = JSON.parse(Buffer.from(jwt.split(".")[1]!, "base64url").toString());
    expect(iat).toBe(now / 1000);
    expect(exp - iat).toBeLessThan(180 * 24 * 3600);
  });
});

describe("invalidProviderField", () => {
  it("rejects a key that is not Apple's", () => {
    expect(invalidProviderField("apple", { privateKey: "nope" })).toMatch(/PEM/);
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect(invalidProviderField("apple", { privateKey: rsa })).toMatch(/EC/);
    expect(invalidProviderField("apple", { privateKey: ecKey() })).toBeNull();
  });

  it("checks URLs, regions and choices", () => {
    expect(invalidProviderField("gitlab", { issuer: "http://gitlab.example.com" })).toMatch(/https/);
    expect(invalidProviderField("gitlab", { issuer: "https://gitlab.example.com" })).toBeNull();
    expect(invalidProviderField("cognito", { region: "Europe" })).toMatch(/region/i);
    expect(invalidProviderField("paypal", { environment: "staging" })).toMatch(/live or sandbox/);
  });
});

describe("secret box", () => {
  const secret = "s".repeat(32);

  it("round-trips and uses a fresh IV each time", () => {
    const a = sealSecret('{"clientSecret":"x"}', secret, "social-provider");
    const b = sealSecret('{"clientSecret":"x"}', secret, "social-provider");
    expect(a).not.toBe(b);
    expect(a).not.toContain("clientSecret");
    expect(openSecret(a, secret, "social-provider")).toBe('{"clientSecret":"x"}');
  });

  it("refuses another secret, another purpose or a tampered value", () => {
    const sealed = sealSecret("value", secret, "social-provider");
    expect(openSecret(sealed, "t".repeat(32), "social-provider")).toBeNull();
    expect(openSecret(sealed, secret, "other")).toBeNull();
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(openSecret(parts.join("."), secret, "social-provider")).toBeNull();
    expect(openSecret("garbage", secret, "social-provider")).toBeNull();
  });

  it("refuses a truncated authentication tag (GCM must check all 16 bytes)", () => {
    const parts = sealSecret("value", secret, "social-provider").split(".");
    parts[2] = Buffer.from(parts[2]!, "base64url").subarray(0, 4).toString("base64url");
    expect(openSecret(parts.join("."), secret, "social-provider")).toBeNull();
  });
});
