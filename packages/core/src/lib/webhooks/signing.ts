import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/*
 * Standard Webhooks signatures (https://www.standardwebhooks.com/): each request carries
 * `webhook-id`, `webhook-timestamp` (seconds) and `webhook-signature`, a space-separated list
 * of `v1,<base64 HMAC-SHA256 of "<id>.<timestamp>.<body>">`. The key is the bytes encoded in
 * the secret after its `whsec_` prefix. Any library implementing the spec verifies these.
 */

const SECRET_PREFIX = "whsec_";

/** A new signing secret: `whsec_` and 32 random bytes in base64. */
export function generateWebhookSecret(): string {
  return `${SECRET_PREFIX}${randomBytes(32).toString("base64")}`;
}

function secretKey(secret: string): Buffer {
  if (!secret.startsWith(SECRET_PREFIX)) throw new Error("Webhook secrets start with whsec_");
  const key = Buffer.from(secret.slice(SECRET_PREFIX.length), "base64");
  if (key.length < 24) throw new Error("Webhook secret is too short");
  return key;
}

/** The `v1,<base64>` signature of one message with one secret. */
export function signPayload(secret: string, id: string, timestamp: number, body: string): string {
  const digest = createHmac("sha256", secretKey(secret)).update(`${id}.${timestamp}.${body}`).digest("base64");
  return `v1,${digest}`;
}

/** The three headers of a delivery. Several secrets (during a rotation) give several signatures. */
export function webhookHeaders(secrets: string[], id: string, timestamp: number, body: string): Record<string, string> {
  return {
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": secrets.map((secret) => signPayload(secret, id, timestamp, body)).join(" "),
  };
}

/** Accepted clock difference between sender and receiver, as in the reference libraries. */
const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

/**
 * Checks a delivery the way a receiver does: any `v1` signature matches and the timestamp is
 * within five minutes. Used by the tests and the README example mirrors it.
 */
export function verifyWebhook(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  const ts = Number(timestamp);
  if (Math.abs(nowSeconds - ts) > TIMESTAMP_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(signPayload(secret, id, ts, body));
  return signature.split(" ").some((candidate) => {
    const given = Buffer.from(candidate);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
