import { MAX_IMPORT_USERS } from "@ostiary/core/lib/user-import/limits";
import { isRowError, normalizeImportUser, type RawImportFields } from "@ostiary/core/lib/user-import/normalize";
import type { ImportRowError, ImportUser, ParsedImport } from "@ostiary/core/lib/user-import/types";

/*
 * The simple CSV format: a header row, then one user per row. Columns, in any order and any
 * case: email (required), name, username, emailVerified, role, passwordHash (bcrypt). Any other
 * column refuses the file, so that a "password" column is never taken for imported.
 */

const COLUMNS: Record<string, keyof RawImportFields> = {
  email: "email",
  name: "name",
  username: "username",
  emailverified: "emailVerified",
  email_verified: "emailVerified",
  role: "role",
  passwordhash: "passwordHash",
  password_hash: "passwordHash",
};

/** RFC 4180 records: commas, double quotes ("" inside quotes), CRLF or LF. Null on an unclosed quote. */
export function parseCsvRecords(text: string): string[][] | null {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const endRecord = () => {
    record.push(field);
    // Blank lines are skipped.
    if (record.length > 1 || record[0] !== "") records.push(record);
    record = [];
    field = "";
  };
  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"' && field === "") {
      quoted = true;
    } else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRecord();
    } else {
      field += c;
    }
  }
  if (quoted) return null;
  if (field !== "" || record.length > 0) endRecord();
  return records;
}

export function parseCsvImport(text: string, options: { allowAdmin: boolean }): ParsedImport {
  const records = parseCsvRecords(text);
  if (!records) return { ok: false, error: "csvUnbalancedQuotes" };
  if (records.length < 2) return { ok: false, error: "empty" };
  const [header, ...rows] = records;
  if (rows.length > MAX_IMPORT_USERS) return { ok: false, error: "tooManyUsers" };

  const fields: (keyof RawImportFields)[] = [];
  for (const name of header!) {
    const field = COLUMNS[name.trim().toLowerCase()];
    if (!field) return { ok: false, error: "csvUnknownColumn", detail: name.trim().slice(0, 64) };
    if (fields.includes(field)) return { ok: false, error: "csvDuplicateColumn", detail: name.trim().slice(0, 64) };
    fields.push(field);
  }
  if (!fields.includes("email")) return { ok: false, error: "csvMissingEmail" };

  const users: ImportUser[] = [];
  const errors: ImportRowError[] = [];
  rows.forEach((values, index) => {
    const row = index + 1;
    if (values.length !== fields.length) {
      errors.push({ row, email: null, reason: "invalidRecord" });
      return;
    }
    const raw: RawImportFields = {};
    fields.forEach((field, column) => {
      raw[field] = values[column];
    });
    const result = normalizeImportUser(row, raw, options);
    if (isRowError(result)) errors.push(result);
    else users.push(result);
  });
  return { ok: true, users, errors };
}
