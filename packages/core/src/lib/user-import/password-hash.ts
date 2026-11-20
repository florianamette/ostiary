import { compare as bcryptCompare } from "bcryptjs";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";

import * as schema from "@ostiary/core/db/schema";
import type { Database } from "@ostiary/core/lib/account-data/database";

/*
 * Password hashes brought in by a user import (lib/user-import). Ostiary hashes passwords with
 * Better Auth's scrypt. Auth0 (and most others) export bcrypt: imported accounts keep their
 * bcrypt hash until the first successful sign-in, which replaces it with a scrypt hash of the
 * same password (importedPasswordVerifier). Any other format is refused at import.
 */

/** Lowest and highest bcrypt cost accepted. Auth0 uses 10; pure-JS bcrypt at 14 takes about a second. */
export const BCRYPT_MIN_COST = 4;
export const BCRYPT_MAX_COST = 14;

/** $2a$, $2b$ or $2y$, a two-digit cost, then 22 characters of salt and 31 of hash (bcrypt's base64). */
const BCRYPT_HASH = /^\$2[aby]\$(\d{2})\$[./A-Za-z0-9]{53}$/;

/** Whether a stored hash is bcrypt (any cost): verified with bcrypt, not scrypt. */
export function isBcryptHash(hash: string): boolean {
  return BCRYPT_HASH.test(hash);
}

export type PasswordHashProblem = "unsupportedHash" | "bcryptCost";

/**
 * Why an imported password hash cannot be used, or null when it can: only bcrypt is accepted
 * ($2a$, $2b$, $2y$), with a cost Ostiary verifies in reasonable time.
 */
export function importedHashProblem(hash: string): PasswordHashProblem | null {
  const match = BCRYPT_HASH.exec(hash);
  if (!match) return "unsupportedHash";
  const cost = Number(match[1]);
  if (cost < BCRYPT_MIN_COST || cost > BCRYPT_MAX_COST) return "bcryptCost";
  return null;
}

/** Replaces a stored bcrypt hash with `scryptHash`: called once the password matched it. */
export type ReplaceImportedHash = (bcryptHash: string, scryptHash: string) => Promise<void>;

/**
 * Stores the scrypt hash in place of the bcrypt one. Better Auth's verify only receives the
 * hash, so the credential account is found by it: bcrypt salts are random, so two accounts
 * share a hash only when one hash was imported twice, for the same password. Matching the old
 * hash also makes concurrent sign-ins harmless (the second one updates nothing).
 */
export function replaceImportedHash(database: Database): ReplaceImportedHash {
  return async (bcryptHash, scryptHash) => {
    await database
      .update(schema.account)
      .set({ password: scryptHash, updatedAt: new Date() })
      .where(and(eq(schema.account.providerId, "credential"), eq(schema.account.password, bcryptHash)));
  };
}

/**
 * Better Auth's `emailAndPassword.password.verify`: bcrypt hashes (imported accounts) are
 * checked with bcrypt, everything else with Better Auth's default scrypt verify. After a bcrypt
 * match, the password is hashed with scrypt and stored through `replace`, so bcrypt hashes go
 * away as people sign in. The plaintext is only used within this call, in the request that
 * carried it. A failure to store the new hash does not fail the sign-in: the bcrypt hash stays
 * and the next sign-in tries again.
 */
export function importedPasswordVerifier(replace: ReplaceImportedHash) {
  return async ({ hash, password }: { hash: string; password: string }): Promise<boolean> => {
    if (!isBcryptHash(hash)) return verifyPassword({ hash, password });
    // A cost above the import limit was never imported: refuse rather than spend seconds on it.
    if (importedHashProblem(hash)) return false;
    if (!(await bcryptCompare(password, hash))) return false;
    try {
      await replace(hash, await hashPassword(password));
    } catch (error) {
      console.error("bcrypt to scrypt rehash failed", error);
    }
    return true;
  };
}
