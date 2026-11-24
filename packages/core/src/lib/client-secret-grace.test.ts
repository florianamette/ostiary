import { describe, expect, it } from "vitest";

import {
    hashClientSecret,
    parseStoredClientSecret,
    previousSecretExpiry,
    verifyClientSecret,
    withPreviousSecret,
} from "@ostiary/core/lib/client-secret-grace";

const NOW = new Date("2026-11-24T12:00:00Z");
const LATER = new Date("2026-11-24T13:00:00Z");

describe("hashClientSecret", () => {
    it("is Better Auth's default hash (SHA-256, base64url without padding), so secrets stored before keep working", async () => {
        const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("s3cret")));
        const better = Buffer.from(digest).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        expect(hashClientSecret("s3cret")).toBe(better);
        expect(verifyClientSecret("s3cret", better)).toBe(true);
    });
});

describe("a rotation with a grace period", () => {
    const old = hashClientSecret("old");
    const rotated = hashClientSecret("new");
    const stored = withPreviousSecret(rotated, old, LATER);

    it("accepts the new secret, and the previous one until the grace period ends", () => {
        expect(verifyClientSecret("new", stored, NOW)).toBe(true);
        expect(verifyClientSecret("old", stored, NOW)).toBe(true);
        expect(verifyClientSecret("old", stored, new Date(LATER.getTime() + 1000))).toBe(false);
        expect(verifyClientSecret("other", stored, NOW)).toBe(false);
        expect(verifyClientSecret("", stored, NOW)).toBe(false);
    });

    it("says when the previous secret expires, and nothing once it has", () => {
        expect(previousSecretExpiry(stored, NOW)).toEqual(LATER);
        expect(previousSecretExpiry(stored, new Date(LATER.getTime() + 1000))).toBeNull();
        expect(previousSecretExpiry(rotated, NOW)).toBeNull();
        expect(previousSecretExpiry(null, NOW)).toBeNull();
    });

    it("keeps only the secret it replaces at the next rotation", () => {
        const again = withPreviousSecret(hashClientSecret("newest"), stored, LATER);
        expect(parseStoredClientSecret(again)).toEqual({ current: hashClientSecret("newest"), previous: rotated, previousExpiresAt: LATER });
        expect(verifyClientSecret("old", again, NOW)).toBe(false);
        expect(verifyClientSecret("new", again, NOW)).toBe(true);
    });
});
