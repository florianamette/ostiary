import { createCipheriv, createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { openSecret, sealSecret } from "@ostiary/core/lib/secret-box";
import { decryptSecret, encryptSecret } from "@ostiary/core/lib/webhooks/secret-box";

const SECRET = "a-better-auth-secret-of-at-least-32-chars";

describe("secret box", () => {
  it("round-trips and binds the value to its purpose and secret", () => {
    const sealed = sealSecret("client-secret-value", SECRET, "social");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(openSecret(sealed, SECRET, "social")).toBe("client-secret-value");
    expect(openSecret(sealed, SECRET, "webhook-secret")).toBeNull();
    expect(openSecret(sealed, `${SECRET}-other`, "social")).toBeNull();
  });

  it("uses a fresh IV every time", () => {
    expect(sealSecret("x", SECRET, "p")).not.toBe(sealSecret("x", SECRET, "p"));
  });

  it("refuses a tampered ciphertext or tag", () => {
    const [v, iv, tag, data] = sealSecret("value", SECRET, "p").split(".");
    const flip = (part: string) => {
      const bytes = Buffer.from(part, "base64url");
      bytes[0] = bytes[0]! ^ 1;
      return bytes.toString("base64url");
    };
    expect(openSecret([v, iv, tag, flip(data!)].join("."), SECRET, "p")).toBeNull();
    expect(openSecret([v, iv, flip(tag!), data].join("."), SECRET, "p")).toBeNull();
  });

  it("refuses a truncated tag", () => {
    const [v, iv, tag, data] = sealSecret("value", SECRET, "p").split(".");
    const short = Buffer.from(tag!, "base64url").subarray(0, 4).toString("base64url");
    expect(openSecret([v, iv, short, data].join("."), SECRET, "p")).toBeNull();
  });

  it("refuses malformed values", () => {
    expect(openSecret("", SECRET, "p")).toBeNull();
    expect(openSecret("v2.a.b.c", SECRET, "p")).toBeNull();
    expect(openSecret("v1.only-two", SECRET, "p")).toBeNull();
  });
});

/** The webhook secret format written before the shared secret box. */
function legacyEncrypt(plain: string, appSecret: string): string {
  const key = createHmac("sha256", appSecret).update("ostiary:webhook-secret-encryption").digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `v1:${iv.toString("base64")}:${encrypted.toString("base64")}`;
}

describe("webhook secrets", () => {
  it("are sealed with the shared secret box", () => {
    const stored = encryptSecret("whsec_abc", SECRET);
    expect(stored.startsWith("v1.")).toBe(true);
    expect(decryptSecret(stored, SECRET)).toBe("whsec_abc");
    expect(openSecret(stored, SECRET, "webhook-secret")).toBe("whsec_abc");
  });

  it("still reads the legacy format", () => {
    expect(decryptSecret(legacyEncrypt("whsec_legacy", SECRET), SECRET)).toBe("whsec_legacy");
  });

  it("refuses a legacy value with a truncated tag", () => {
    const stored = legacyEncrypt("whsec_legacy", SECRET);
    const [v, iv, data] = stored.split(":");
    // Drop 12 of the 16 tag bytes: an unchecked tag length would verify the remaining 4.
    const truncated = Buffer.from(data!, "base64").subarray(0, -12).toString("base64");
    expect(() => decryptSecret(`${v}:${iv}:${truncated}`, SECRET)).toThrow();
    expect(() => decryptSecret("v1:AAAA:AAAA", SECRET)).toThrow();
  });

  it("throws under another BETTER_AUTH_SECRET", () => {
    expect(() => decryptSecret(encryptSecret("whsec_x", SECRET), `${SECRET}-rotated`)).toThrow();
    expect(() => decryptSecret(legacyEncrypt("whsec_x", SECRET), `${SECRET}-rotated`)).toThrow();
  });
});
