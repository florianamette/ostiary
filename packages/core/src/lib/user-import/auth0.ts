import { MAX_IMPORT_USERS } from "@ostiary/core/lib/user-import/limits";
import { isRowError, normalizeImportUser } from "@ostiary/core/lib/user-import/normalize";
import type { ImportRowError, ImportUser, ParsedImport } from "@ostiary/core/lib/user-import/types";

/*
 * Auth0's exports (docs/import-users.md):
 *
 * - The user export job (Management API `POST /api/v2/jobs/users-exports`, or the "User Import
 *   / Export" extension) writes one JSON object per line (NDJSON), or a JSON array with the
 *   extension. Fields used: email, email_verified, name, given_name, family_name, nickname,
 *   username, picture, created_at, user_id, blocked.
 * - The password hash export, which Auth0 support provides on request, is NDJSON too:
 *   `{"_id":{"$oid":"..."},"email":"...","passwordHash":"$2b$10$...",...}`. Its `_id` is the
 *   part of the user_id after "auth0|". A record may also carry `passwordHash` itself (the
 *   hash export can be imported on its own).
 *
 * Auth0's user_id is not stored (Ostiary has no field for it): it only joins the two files.
 */

type JsonRecords = { ok: true; records: unknown[] } | { ok: false };

/** A JSON array, or one JSON value per line. A line that does not parse becomes `undefined`. */
function parseJsonRecords(text: string, strict: boolean): JsonRecords | "tooMany" {
  const trimmed = text.replace(/^﻿/, "").trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) return { ok: false };
      return parsed.length > MAX_IMPORT_USERS ? "tooMany" : { ok: true, records: parsed };
    } catch {
      return { ok: false };
    }
  }
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length > MAX_IMPORT_USERS) return "tooMany";
  const records: unknown[] = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line));
    } catch {
      if (strict) return { ok: false };
      records.push(undefined);
    }
  }
  return { ok: true, records };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The hash export's `_id` ({"$oid": "..."} or a string), as an Auth0 user_id. */
function auth0Id(record: Record<string, unknown>): string | null {
  if (typeof record.user_id === "string" && record.user_id) return record.user_id;
  const id = record._id;
  const oid = isObject(id) ? id.$oid : id;
  return typeof oid === "string" && oid ? `auth0|${oid}` : null;
}

const emailKey = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : null);

type HashIndex = { byId: Map<string, unknown>; byEmail: Map<string, unknown> };

/** The password hash export, indexed by user_id and by email (an email found twice is not used). */
export function parseAuth0PasswordHashes(text: string): HashIndex | null {
  const parsed = parseJsonRecords(text, true);
  if (parsed === "tooMany" || !parsed.ok) return null;
  const byId = new Map<string, unknown>();
  const byEmail = new Map<string, unknown>();
  const ambiguous = new Set<string>();
  for (const record of parsed.records) {
    if (!isObject(record)) return null;
    const hash = record.passwordHash;
    if (hash === undefined || hash === null || hash === "") continue;
    const id = auth0Id(record);
    if (id) byId.set(id, hash);
    const email = emailKey(record.email);
    if (!email) continue;
    // Auth0 allows one address in several database connections: no guessing which hash is whose.
    if (byEmail.has(email) && byEmail.get(email) !== hash) ambiguous.add(email);
    byEmail.set(email, hash);
  }
  for (const email of ambiguous) byEmail.delete(email);
  return { byId, byEmail };
}

/**
 * An Auth0 user export, with the password hash export joined by user_id, else by email. Each
 * record is checked on its own (normalizeImportUser); a line that is not a JSON object is
 * reported as an invalid row.
 */
export function parseAuth0Import(usersText: string, hashesText: string | null): ParsedImport {
  const parsed = parseJsonRecords(usersText, false);
  if (parsed === "tooMany") return { ok: false, error: "tooManyUsers" };
  if (!parsed.ok) return { ok: false, error: "invalidJson" };
  if (parsed.records.length === 0) return { ok: false, error: "empty" };

  let hashes: HashIndex | null = null;
  if (hashesText !== null) {
    hashes = parseAuth0PasswordHashes(hashesText);
    if (!hashes) return { ok: false, error: "invalidHashFile" };
  }

  const users: ImportUser[] = [];
  const errors: ImportRowError[] = [];
  parsed.records.forEach((record, index) => {
    const row = index + 1;
    if (!isObject(record)) {
      errors.push({ row, email: null, reason: "invalidRecord" });
      return;
    }
    const id = auth0Id(record);
    const email = emailKey(record.email);
    const passwordHash =
      record.passwordHash ??
      (id ? hashes?.byId.get(id) : undefined) ??
      (email ? hashes?.byEmail.get(email) : undefined);
    const result = normalizeImportUser(
      row,
      {
        email: record.email,
        name: record.name,
        givenName: record.given_name,
        familyName: record.family_name,
        nickname: record.nickname,
        username: record.username,
        emailVerified: record.email_verified,
        picture: record.picture,
        createdAt: record.created_at,
        blocked: record.blocked,
        passwordHash,
      },
      // Auth0 roles are not part of the export: everyone is imported as a user.
      { allowAdmin: false },
    );
    if (isRowError(result)) errors.push(result);
    else users.push(result);
  });
  return { ok: true, users, errors };
}
