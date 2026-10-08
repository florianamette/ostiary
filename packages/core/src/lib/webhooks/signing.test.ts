import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "@ostiary/core/lib/webhooks/secret-box";
import { generateWebhookSecret, signPayload, verifyWebhook, webhookHeaders } from "@ostiary/core/lib/webhooks/signing";

describe("Standard Webhooks signatures", () => {
  it("matches the reference test vector", () => {
    // From the Standard Webhooks / Svix reference libraries.
    const signature = signPayload("whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw", "msg_p5jXN8AQM9LWM0D4loKWxJek", 1614265330, '{"test": 2432232314}');
    expect(signature).toBe("v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=");
  });

  it("generates whsec_ secrets of 32 bytes", () => {
    const secret = generateWebhookSecret();
    expect(secret).toMatch(/^whsec_[A-Za-z0-9+/]+=*$/);
    expect(Buffer.from(secret.slice(6), "base64")).toHaveLength(32);
    expect(generateWebhookSecret()).not.toBe(secret);
  });

  it("verifies its own headers, and refuses a wrong secret, a changed body or an old timestamp", () => {
    const secret = generateWebhookSecret();
    const body = JSON.stringify({ id: "evt_1", type: "user.created" });
    const now = 1_760_000_000;
    const h = webhookHeaders([secret], "evt_1", now, body);
    const headers = { id: h["webhook-id"]!, timestamp: h["webhook-timestamp"]!, signature: h["webhook-signature"]! };
    expect(verifyWebhook(secret, headers, body, now)).toBe(true);
    expect(verifyWebhook(generateWebhookSecret(), headers, body, now)).toBe(false);
    expect(verifyWebhook(secret, headers, body.replace("created", "deleted"), now)).toBe(false);
    expect(verifyWebhook(secret, { ...headers, id: "evt_2" }, body, now)).toBe(false);
    expect(verifyWebhook(secret, headers, body, now + 301)).toBe(false);
    expect(verifyWebhook(secret, { ...headers, signature: null }, body, now)).toBe(false);
  });

  it("signs with every secret during a rotation, and each one verifies", () => {
    const [oldSecret, newSecret] = [generateWebhookSecret(), generateWebhookSecret()];
    const h = webhookHeaders([newSecret, oldSecret], "evt_1", 100, "{}");
    expect(h["webhook-signature"]!.split(" ")).toHaveLength(2);
    const headers = { id: "evt_1", timestamp: "100", signature: h["webhook-signature"]! };
    expect(verifyWebhook(newSecret, headers, "{}", 100)).toBe(true);
    expect(verifyWebhook(oldSecret, headers, "{}", 100)).toBe(true);
  });

  it("refuses secrets without the whsec_ prefix", () => {
    expect(() => signPayload("abc", "id", 1, "{}")).toThrow();
  });
});

describe("secret encryption", () => {
  const appSecret = "01234567890123456789012345678901";

  it("round-trips and never stores the secret in clear", () => {
    const secret = generateWebhookSecret();
    const stored = encryptSecret(secret, appSecret);
    expect(stored).not.toContain(secret.slice(6, 20));
    expect(stored.startsWith("v1:")).toBe(true);
    expect(decryptSecret(stored, appSecret)).toBe(secret);
    expect(encryptSecret(secret, appSecret)).not.toBe(stored);
  });

  it("fails with another key or a tampered value", () => {
    const stored = encryptSecret(generateWebhookSecret(), appSecret);
    expect(() => decryptSecret(stored, "another-secret-another-secret-xx")).toThrow();
    const [v, iv, data] = stored.split(":");
    const flipped = Buffer.from(data!, "base64");
    flipped[0] = flipped[0]! ^ 1;
    expect(() => decryptSecret(`${v}:${iv}:${flipped.toString("base64")}`, appSecret)).toThrow();
  });
});
