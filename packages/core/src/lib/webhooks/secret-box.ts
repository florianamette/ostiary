import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/*
 * Webhook signing secrets must be read back to sign each delivery, so they cannot be hashed
 * like SCIM tokens. They are encrypted with AES-256-GCM under a key derived from
 * BETTER_AUTH_SECRET: a database dump alone does not reveal them. The admin console shows a
 * secret once, when it is created or rotated, and never again. Changing BETTER_AUTH_SECRET
 * makes the stored secrets unreadable: rotate each endpoint's secret afterwards.
 */

const VERSION = "v1";

function key(appSecret: string): Buffer {
  return createHmac("sha256", appSecret).update("ostiary:webhook-secret-encryption").digest();
}

export function encryptSecret(plain: string, appSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(appSecret), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `${VERSION}:${iv.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(stored: string, appSecret: string): string {
  const [version, ivPart, dataPart] = stored.split(":");
  if (version !== VERSION || !ivPart || !dataPart) throw new Error("Unknown webhook secret format");
  const data = Buffer.from(dataPart, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(appSecret), Buffer.from(ivPart, "base64"));
  decipher.setAuthTag(data.subarray(data.length - 16));
  return Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]).toString("utf8");
}
