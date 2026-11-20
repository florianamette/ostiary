/** A user ready to be created, after a file's row passed every check that needs no database. */
export type ImportUser = {
  /** Position of the record in the file, from 1 (the CSV header row is not counted). */
  row: number;
  /** Trimmed and lowercased, as Better Auth stores addresses. */
  email: string;
  name: string;
  /** Lowercased (the username plugin's normalization) and the original spelling, for display. */
  username: string | null;
  displayUsername: string | null;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date | null;
  role: "user" | "admin";
  /** Blocked in the source system: imported as banned. */
  blocked: boolean;
  /** bcrypt, checked by importedHashProblem. */
  passwordHash: string | null;
};

/** Why a row is not imported. Translated in the console (admin.pages.userImport.reasons). */
export type ImportRowReason =
  | "invalidRecord"
  | "missingEmail"
  | "invalidEmail"
  | "invalidName"
  | "invalidUsername"
  | "invalidEmailVerified"
  | "invalidRole"
  | "adminNotAllowed"
  | "unsupportedHash"
  | "bcryptCost"
  | "duplicateInFile"
  | "usernameTaken";

export type ImportRowError = { row: number; email: string | null; reason: ImportRowReason };

/** Why a whole file is refused. Translated in the console (admin.pages.userImport.fileErrors). */
export type ImportFileError =
  | "empty"
  | "tooLarge"
  | "tooManyUsers"
  | "invalidJson"
  | "csvMissingEmail"
  | "csvUnknownColumn"
  | "csvDuplicateColumn"
  | "csvUnbalancedQuotes"
  | "invalidHashFile";

export type ParsedImport =
  | { ok: true; users: ImportUser[]; errors: ImportRowError[] }
  | { ok: false; error: ImportFileError; detail?: string };
