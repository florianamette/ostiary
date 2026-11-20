import { createHash } from "node:crypto";

import type { Database } from "@ostiary/core/lib/account-data/database";
import type { EmailDedupMode } from "@ostiary/core/lib/security/email-aliases";
import { parseAuth0Import } from "@ostiary/core/lib/user-import/auth0";
import { parseCsvImport } from "@ostiary/core/lib/user-import/csv";
import { MAX_IMPORT_BYTES, MAX_REPORTED_ROW_ERRORS } from "@ostiary/core/lib/user-import/limits";
import { planImport, type ImportPlan } from "@ostiary/core/lib/user-import/plan";
import type { ImportFileError, ImportRowError, ParsedImport } from "@ostiary/core/lib/user-import/types";

/*
 * Bulk user import from the admin console (docs/import-users.md): a dry run (previewImport)
 * shows what would happen, then the import itself (commit.ts) writes the users the dry run
 * planned, checked again against the database at that moment.
 */

export type ImportFormat = "auth0" | "csv";

export type ImportInput = {
  format: ImportFormat;
  /** The user file's text. */
  users: string;
  /** Auth0 only: the password hash export, joined to the users. */
  hashes: string | null;
  /** CSV only: whether the role column may say "admin". */
  allowAdmin: boolean;
};

/** What the dry run shows. `digest` ties the confirmation to the files and options checked. */
export type ImportSummary = {
  digest: string;
  rows: number;
  toCreate: number;
  withPassword: number;
  admins: number;
  blocked: number;
  skippedExisting: number;
  skippedAlias: number;
  invalid: number;
  /** The first MAX_REPORTED_ROW_ERRORS refused rows. */
  errors: ImportRowError[];
};

export type ImportPreview =
  | { ok: true; summary: ImportSummary; plan: ImportPlan }
  | { ok: false; error: ImportFileError; detail?: string };

/** SHA-256 of everything the result depends on, so a confirmation imports what was checked. */
export function importDigest(input: ImportInput): string {
  const hash = createHash("sha256");
  for (const part of [input.format, input.allowAdmin ? "admin" : "user", input.users, input.hashes ?? ""]) {
    hash.update(String(Buffer.byteLength(part)));
    hash.update(":");
    hash.update(part);
  }
  return hash.digest("hex");
}

export function parseImport(input: ImportInput): ParsedImport {
  if (Buffer.byteLength(input.users) + Buffer.byteLength(input.hashes ?? "") > MAX_IMPORT_BYTES) {
    return { ok: false, error: "tooLarge" };
  }
  if (input.users.trim() === "") return { ok: false, error: "empty" };
  return input.format === "csv"
    ? parseCsvImport(input.users, { allowAdmin: input.allowAdmin })
    : parseAuth0Import(input.users, input.hashes);
}

/** The dry run: parses the files and checks them against the database. Writes nothing. */
export async function previewImport(database: Database, input: ImportInput, dedup: EmailDedupMode): Promise<ImportPreview> {
  const parsed = parseImport(input);
  if (!parsed.ok) return parsed;
  const plan = await planImport(database, parsed.users, parsed.errors, dedup);
  return {
    ok: true,
    plan,
    summary: {
      digest: importDigest(input),
      rows: parsed.users.length + parsed.errors.length,
      toCreate: plan.toCreate.length,
      withPassword: plan.toCreate.filter((u) => u.passwordHash).length,
      admins: plan.toCreate.filter((u) => u.role === "admin").length,
      blocked: plan.toCreate.filter((u) => u.blocked).length,
      skippedExisting: plan.skippedExisting,
      skippedAlias: plan.skippedAlias,
      invalid: plan.errors.length,
      errors: plan.errors.slice(0, MAX_REPORTED_ROW_ERRORS),
    },
  };
}

export { commitImport, type ImportResult } from "@ostiary/core/lib/user-import/commit";
export { MAX_IMPORT_BYTES, MAX_IMPORT_USERS } from "@ostiary/core/lib/user-import/limits";
export type { ImportFileError, ImportRowError, ImportRowReason } from "@ostiary/core/lib/user-import/types";
