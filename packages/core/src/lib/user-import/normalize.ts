import { z } from "zod";

import { importedHashProblem } from "@ostiary/core/lib/user-import/password-hash";
import type { ImportRowError, ImportUser } from "@ostiary/core/lib/user-import/types";

/** A record's fields as found in the file, before any check. */
export type RawImportFields = {
  email?: unknown;
  name?: unknown;
  givenName?: unknown;
  familyName?: unknown;
  nickname?: unknown;
  username?: unknown;
  emailVerified?: unknown;
  picture?: unknown;
  createdAt?: unknown;
  role?: unknown;
  blocked?: unknown;
  passwordHash?: unknown;
};

const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 255;
const MAX_PICTURE_LENGTH = 2048;
/** The username plugin's defaults (Better Auth): 3 to 30 letters, digits, "_" and ".". */
const USERNAME = /^[a-zA-Z0-9_.]{3,30}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

const emailSchema = z.email();

const isBlank = (value: unknown) => value === undefined || value === null || (typeof value === "string" && value.trim() === "");

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** true, false, or undefined when the value is neither (strings from a CSV included). */
export function parseBoolean(value: unknown): boolean | undefined {
  if (isBlank(value)) return false;
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const lower = value.trim().toLowerCase();
  if (["true", "1", "yes"].includes(lower)) return true;
  if (["false", "0", "no"].includes(lower)) return false;
  return undefined;
}

/** An https picture URL is kept; anything else is dropped (the account gets initials instead). */
function picture(value: unknown): string | null {
  const url = text(value);
  if (!url || url.length > MAX_PICTURE_LENGTH) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** The source system's sign-up date, when it is a real date in the past. */
function createdAt(value: unknown): Date | null {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) || date.getTime() > Date.now() ? null : date;
}

/**
 * Checks one record and turns it into a user to create, or the reason it is refused. Nothing
 * here reads the database: existing accounts and usernames are checked by planImport.
 */
export function normalizeImportUser(
  row: number,
  raw: RawImportFields,
  options: { allowAdmin: boolean },
): ImportUser | ImportRowError {
  const rawEmail = text(raw.email);
  const fail = (reason: ImportRowError["reason"]): ImportRowError => ({ row, email: rawEmail?.slice(0, MAX_EMAIL_LENGTH) ?? null, reason });

  if (!rawEmail) return fail("missingEmail");
  const email = rawEmail.toLowerCase();
  if (email.length > MAX_EMAIL_LENGTH || !emailSchema.safeParse(email).success) return fail("invalidEmail");

  if (!isBlank(raw.name) && typeof raw.name !== "string") return fail("invalidName");
  const fullName = [text(raw.givenName), text(raw.familyName)].filter(Boolean).join(" ");
  const name = text(raw.name) ?? (fullName || text(raw.nickname) || email.slice(0, email.indexOf("@")));
  if (name.length > MAX_NAME_LENGTH || CONTROL_CHARACTERS.test(name)) return fail("invalidName");

  let username: string | null = null;
  if (!isBlank(raw.username)) {
    if (typeof raw.username !== "string" || !USERNAME.test(raw.username.trim())) return fail("invalidUsername");
    username = raw.username.trim();
  }

  const emailVerified = parseBoolean(raw.emailVerified);
  if (emailVerified === undefined) return fail("invalidEmailVerified");

  let role: ImportUser["role"] = "user";
  if (!isBlank(raw.role)) {
    const value = typeof raw.role === "string" ? raw.role.trim().toLowerCase() : null;
    if (value === "admin") {
      if (!options.allowAdmin) return fail("adminNotAllowed");
      role = "admin";
    } else if (value !== "user") {
      return fail("invalidRole");
    }
  }

  let passwordHash: string | null = null;
  if (!isBlank(raw.passwordHash)) {
    if (typeof raw.passwordHash !== "string") return fail("unsupportedHash");
    const problem = importedHashProblem(raw.passwordHash.trim());
    if (problem) return fail(problem);
    passwordHash = raw.passwordHash.trim();
  }

  return {
    row,
    email,
    name,
    username: username?.toLowerCase() ?? null,
    displayUsername: username,
    emailVerified,
    image: picture(raw.picture),
    createdAt: createdAt(raw.createdAt),
    role,
    blocked: parseBoolean(raw.blocked) === true,
    passwordHash,
  };
}

export function isRowError(value: ImportUser | ImportRowError): value is ImportRowError {
  return "reason" in value;
}
