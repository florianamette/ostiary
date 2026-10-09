import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/*
 * Encryption at rest for secrets the admin console stores (social provider client secrets and
 * keys). AES-256-GCM with a key derived from BETTER_AUTH_SECRET for one purpose, so the value is
 * useless without the server's secret. Changing BETTER_AUTH_SECRET makes stored secrets
 * unreadable: they then have to be entered again.
 *
 * Format: `v1.<iv>.<auth tag>.<ciphertext>`, each part base64url.
 */

const VERSION = "v1";
/** GCM tag length in bytes. Set on decryption too, so a truncated tag is refused. */
const AUTH_TAG_LENGTH = 16;

function deriveKey(secret: string, purpose: string): Buffer {
  return createHmac("sha256", secret).update(`ostiary:secret-box:${purpose}`).digest();
}

export function sealSecret(plaintext: string, secret: string, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret, purpose), iv, { authTagLength: AUTH_TAG_LENGTH });
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

/** The plaintext, or null when the value is malformed or was sealed with another secret. */
export function openSecret(sealed: string, secret: string, purpose: string): string | null {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || data === undefined) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret, purpose), Buffer.from(iv, "base64url"), {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
