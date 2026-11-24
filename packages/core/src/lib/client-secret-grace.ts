import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Client secrets with a grace period after rotation. Better Auth stores a secret as its
 * SHA-256 hash (base64url, 43 characters) and keeps one per client. Ostiary gives it its own
 * `storeClientSecret`: the same hash, so every stored secret stays valid, and a stored value
 * may carry the previous secret's hash and when it stops working:
 *
 *   <current hash>:<previous hash>:<expiry, Unix seconds>
 *
 * Rotating from the admin console with a grace period writes that form; the previous secret is
 * accepted until the expiry, then ignored (and dropped at the next rotation).
 */

/** Grace periods offered when rotating, in seconds. */
export const SECRET_GRACE_PERIODS = { none: 0, "1h": 3_600, "24h": 86_400, "7d": 604_800 } as const;
export type SecretGracePeriod = keyof typeof SECRET_GRACE_PERIODS;

const SEPARATOR = ":";

/** Better Auth's hash of a client secret (its `defaultHasher`). */
export function hashClientSecret(secret: string): string {
    return createHash("sha256").update(secret).digest("base64url");
}

export type StoredClientSecret = { current: string; previous?: string; previousExpiresAt?: Date };

export function parseStoredClientSecret(stored: string): StoredClientSecret {
    const [current, previous, expiry] = stored.split(SEPARATOR);
    const seconds = Number(expiry);
    if (!previous || !Number.isInteger(seconds)) return { current: current! };
    return { current: current!, previous, previousExpiresAt: new Date(seconds * 1000) };
}

/** The stored value after a rotation: the new hash, and the old current hash until `expiresAt`. */
export function withPreviousSecret(newStored: string, oldStored: string, expiresAt: Date): string {
    const { current: previous } = parseStoredClientSecret(oldStored);
    return [parseStoredClientSecret(newStored).current, previous, Math.floor(expiresAt.getTime() / 1000)].join(SEPARATOR);
}

/** When the previous secret stops working, or null when none is valid any more. */
export function previousSecretExpiry(stored: string | null | undefined, now = new Date()): Date | null {
    if (!stored) return null;
    const { previousExpiresAt } = parseStoredClientSecret(stored);
    return previousExpiresAt && previousExpiresAt > now ? previousExpiresAt : null;
}

function sameHash(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
}

/** Whether `secret` (without its prefix) is the current secret, or the previous one in its grace period. */
export function verifyClientSecret(secret: string, stored: string, now = new Date()): boolean {
    if (!secret) return false;
    const hash = hashClientSecret(secret);
    const { current, previous, previousExpiresAt } = parseStoredClientSecret(stored);
    if (sameHash(hash, current)) return true;
    return Boolean(previous && previousExpiresAt && previousExpiresAt > now && sameHash(hash, previous));
}

/** Better Auth's `storeClientSecret` option. */
export const clientSecretStorage = {
    hash: async (secret: string) => hashClientSecret(secret),
    verify: async (secret: string, stored: string) => verifyClientSecret(secret, stored),
};
