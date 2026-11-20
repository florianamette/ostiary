import { generateId } from "@better-auth/core/utils/id";

import * as schema from "@ostiary/core/db/schema";
import type { Database } from "@ostiary/core/lib/account-data/database";
import { joinPublicOrganization } from "@ostiary/core/lib/public-organization-membership";
import { IMPORT_BATCH_SIZE } from "@ostiary/core/lib/user-import/limits";
import type { ImportUser } from "@ostiary/core/lib/user-import/types";

/** The ban reason of accounts that were blocked in the system they come from. */
export const IMPORTED_BLOCKED_REASON = "Blocked before the import";

export type ImportResult = {
  created: number;
  withPassword: number;
  /** Rows whose address or username an account took between the dry run and the import. */
  skippedConflict: number;
  /** Rows not written because a batch failed (the batches before it are kept). */
  notImported: number;
};

/*
 * Writes the users of an import plan, IMPORT_BATCH_SIZE per transaction: the user row, the
 * credential account with the bcrypt hash when there is one, and the Public organization
 * membership (joinPublicOrganization, as database-hooks.ts does for every new account).
 *
 * The rows are inserted directly rather than through Better Auth's internal adapter, so its
 * database hooks do not run, on purpose:
 * - user.create.before would give the admin role to an ADMIN_EMAILS address marked verified by
 *   the file. Imported accounts get exactly the role the import says ("user" unless the admin
 *   allowed admins). ADMIN_EMAILS still promotes once the person proves the inbox
 *   (verification link or sign-in code), as for any account.
 * - user.create.after would record one sign_up auth event per account: imports are not
 *   sign-ups and would swamp the sign-up charts. The import's audit entry records it instead.
 * - The webhook adapter would queue a user.created event per account: thousands of events
 *   for one admin action. Apps learn about imported users when they first sign in.
 * - Nothing sends email: no verification, no welcome, no password reset.
 * The membership, the one thing user.create.after does that every account needs, goes through
 * the same function. Conflicting rows (an account created since the dry run) are skipped by
 * ON CONFLICT DO NOTHING: an import never overwrites an account.
 */
export async function commitImport(database: Database, users: readonly ImportUser[]): Promise<ImportResult> {
  const result: ImportResult = { created: 0, withPassword: 0, skippedConflict: 0, notImported: 0 };
  for (let start = 0; start < users.length; start += IMPORT_BATCH_SIZE) {
    const batch = users.slice(start, start + IMPORT_BATCH_SIZE);
    try {
      const { created, withPassword } = await database.transaction(async (tx) => writeBatch(tx as unknown as Database, batch));
      result.created += created;
      result.withPassword += withPassword;
      result.skippedConflict += batch.length - created;
    } catch (error) {
      console.error("user import batch failed", error);
      result.notImported = users.length - start;
      break;
    }
  }
  return result;
}

async function writeBatch(tx: Database, batch: readonly ImportUser[]) {
  const now = new Date();
  const rows = batch.map((user) => ({ ...user, id: generateId() }));
  const inserted = await tx
    .insert(schema.user)
    .values(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        emailVerified: row.emailVerified,
        image: row.image,
        username: row.username,
        displayUsername: row.displayUsername,
        role: row.role,
        banned: row.blocked,
        banReason: row.blocked ? IMPORTED_BLOCKED_REASON : null,
        twoFactorEnabled: false,
        createdAt: row.createdAt ?? now,
        updatedAt: now,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: schema.user.id });
  const insertedIds = new Set(inserted.map((row) => row.id));

  // Better Auth's credential account: accountId is the user id, password the hash.
  const accounts = rows
    .filter((row) => insertedIds.has(row.id) && row.passwordHash)
    .map((row) => ({
      id: generateId(),
      accountId: row.id,
      providerId: "credential",
      userId: row.id,
      password: row.passwordHash,
      createdAt: now,
      updatedAt: now,
    }));
  if (accounts.length > 0) await tx.insert(schema.account).values(accounts);

  await joinPublicOrganization(tx, [...insertedIds]);
  return { created: insertedIds.size, withPassword: accounts.length };
}
