import { createDecipheriv, createHmac } from "node:crypto";

import { openSecret, sealSecret } from "@ostiary/core/lib/secret-box";

/*
 * Webhook signing secrets must be read back to sign each delivery, so they cannot be hashed
 * like SCIM tokens. They are sealed with the shared secret box (lib/secret-box.ts, AES-256-GCM
 * under a key derived from BETTER_AUTH_SECRET): a database dump alone does not reveal them. The
 * admin console shows a secret once, when it is created or rotated, and never again. Changing
 * BETTER_AUTH_SECRET makes the stored secrets unreadable: rotate each endpoint's secret afterwards.
 */

const PURPOSE = "webhook-secret";

export function encryptSecret(plain: string, appSecret: string): string {
  return sealSecret(plain, appSecret, PURPOSE);
}

/** The secret. Throws when it is malformed or was sealed with another BETTER_AUTH_SECRET. */
export function decryptSecret(stored: string, appSecret: string): string {
  const plain = stored.startsWith(LEGACY_PREFIX) ? openLegacySecret(stored, appSecret) : openSecret(stored, appSecret, PURPOSE);
  if (plain === null) throw new Error("Unreadable webhook secret");
  return plain;
}

/*
 * Secrets written before the shared secret box: `v1:<iv>:<ciphertext + tag>`, base64, under
 * their own key. Still read, never written; a rotation replaces them with the current format.
 */
const LEGACY_PREFIX = "v1:";
const TAG_LENGTH = 16;

function openLegacySecret(stored: string, appSecret: string): string | null {
  const [, ivPart, dataPart] = stored.split(":");
  if (!ivPart || !dataPart) return null;
  const data = Buffer.from(dataPart, "base64");
  if (data.length < TAG_LENGTH) return null;
  try {
    const key = createHmac("sha256", appSecret).update("ostiary:webhook-secret-encryption").digest();
    // The tag length is fixed, so a truncated tag is refused instead of checked on fewer bytes.
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64"), { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(data.subarray(data.length - TAG_LENGTH));
    return Buffer.concat([decipher.update(data.subarray(0, data.length - TAG_LENGTH)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
