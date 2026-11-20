import { inArray, sql } from "drizzle-orm";

import * as schema from "@ostiary/core/db/schema";
import type { Database } from "@ostiary/core/lib/account-data/database";
import { emailAlias, emailAliasSql, type EmailDedupMode } from "@ostiary/core/lib/security/email-aliases";
import type { ImportRowError, ImportUser } from "@ostiary/core/lib/user-import/types";

/** What an import would do, from a file's users and the accounts already in the database. */
export type ImportPlan = {
  toCreate: ImportUser[];
  /** An account already has this address: never overwritten. */
  skippedExisting: number;
  /** EMAIL_DEDUP: an account already has an address reaching the same inbox. */
  skippedAlias: number;
  /** Every refused row, from the file's checks and from these, in file order. */
  errors: ImportRowError[];
};

const CHUNK = 1000;

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

async function existingEmails(database: Database, emails: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const part of chunks(emails)) {
    const lower = sql<string>`lower(${schema.user.email})`;
    const rows = await database
      .select({ email: lower })
      .from(schema.user)
      .where(inArray(lower, part));
    for (const row of rows) found.add(row.email);
  }
  return found;
}

async function existingAliases(database: Database, aliases: string[], mode: Exclude<EmailDedupMode, "off">): Promise<Set<string>> {
  const found = new Set<string>();
  const alias = emailAliasSql(schema.user.email, mode);
  for (const part of chunks(aliases)) {
    const rows = await database
      .select({ alias: sql<string>`${alias}` })
      .from(schema.user)
      .where(inArray(alias, part));
    for (const row of rows) found.add(row.alias);
  }
  return found;
}

async function takenUsernames(database: Database, usernames: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const part of chunks(usernames)) {
    const rows = await database
      .select({ username: schema.user.username })
      .from(schema.user)
      .where(inArray(schema.user.username, part));
    for (const row of rows) if (row.username) found.add(row.username);
  }
  return found;
}

/**
 * Sorts a file's users into those to create and those skipped. An address that already has an
 * account is skipped, as is one reaching the same inbox as an account's under EMAIL_DEDUP (as
 * self-service sign-up refuses it). Within the file, only the first of two rows for one inbox
 * is kept; a username already taken refuses the row. Nothing is written.
 */
export async function planImport(
  database: Database,
  users: readonly ImportUser[],
  fileErrors: readonly ImportRowError[],
  dedup: EmailDedupMode,
): Promise<ImportPlan> {
  const aliasOf = (email: string) => (dedup === "off" ? null : emailAlias(email, dedup));
  const existing = await existingEmails(database, [...new Set(users.map((u) => u.email))]);
  const aliases =
    dedup === "off"
      ? new Set<string>()
      : await existingAliases(database, [...new Set(users.filter((u) => !existing.has(u.email)).map((u) => aliasOf(u.email)!))], dedup);
  const usernames = await takenUsernames(database, [...new Set(users.flatMap((u) => (u.username ? [u.username] : [])))]);

  const plan: ImportPlan = { toCreate: [], skippedExisting: 0, skippedAlias: 0, errors: [...fileErrors] };
  const seenEmails = new Set<string>();
  const seenUsernames = new Set<string>();
  for (const user of users) {
    const alias = aliasOf(user.email);
    if (existing.has(user.email)) {
      plan.skippedExisting++;
    } else if (alias && aliases.has(alias)) {
      plan.skippedAlias++;
    } else if (seenEmails.has(user.email) || (alias && seenEmails.has(alias))) {
      plan.errors.push({ row: user.row, email: user.email, reason: "duplicateInFile" });
    } else if (user.username && (usernames.has(user.username) || seenUsernames.has(user.username))) {
      plan.errors.push({ row: user.row, email: user.email, reason: "usernameTaken" });
    } else {
      plan.toCreate.push(user);
      seenEmails.add(user.email);
      if (alias) seenEmails.add(alias);
      if (user.username) seenUsernames.add(user.username);
    }
  }
  plan.errors.sort((a, b) => a.row - b.row);
  return plan;
}
