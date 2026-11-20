import { db } from "@ostiary/core/db/index";
import { env } from "@ostiary/core/lib/env";
import { ValidationError } from "@ostiary/core/lib/errors";
import {
  commitImport,
  MAX_IMPORT_BYTES,
  previewImport,
  type ImportFileError,
  type ImportFormat,
  type ImportInput,
  type ImportResult,
  type ImportSummary,
} from "@ostiary/core/lib/user-import";
import { adminJsonRoute } from "@/lib/admin-json-route";

/*
 * Bulk user import (docs/import-users.md, lib/user-import), a route rather than a server
 * action so that only this endpoint accepts a 10 MB body: the Origin, the declared size and
 * the admin session are checked before any of it is read (adminJsonRoute).
 *
 * The browser sends the files with each call: the dry run (`?step=preview`) keeps nothing on
 * the server, and the confirmation (`?step=confirm`, with the dry run's `digest`) parses and
 * checks them again, against the database as it is then. The digest makes sure it imports
 * what the admin saw in the dry run.
 *
 * Errors are codes (UserImportError), translated by the page.
 */

export type UserImportCounts = ImportResult & Pick<ImportSummary, "skippedExisting" | "skippedAlias" | "invalid">;

export type UserImportError = { code: "noFile" | "tooLarge" | "changed" | ImportFileError; detail?: string };

export type UserImportResponse =
  | { ok: true; step: "preview"; summary: ImportSummary }
  | { ok: true; step: "confirm"; counts: UserImportCounts }
  | { ok: false; error: UserImportError };

/** The files plus the form fields, a little multipart overhead included. */
const MAX_REQUEST_BYTES = MAX_IMPORT_BYTES + 64 * 1024;
const MAX_LISTED_ADMINS = 100;

/** The form, read without trusting it: known fields only, the files' sizes before their bytes. */
async function readForm(form: FormData): Promise<{ ok: true; input: ImportInput; fileName: string } | { ok: false; error: UserImportError }> {
  const format: ImportFormat = form.get("format") === "csv" ? "csv" : "auth0";
  const users = form.get("users");
  const hashes = format === "auth0" ? form.get("hashes") : null;
  if (!(users instanceof File) || users.size === 0) return { ok: false, error: { code: "noFile" } };
  const hashFile = hashes instanceof File && hashes.size > 0 ? hashes : null;
  if (users.size + (hashFile?.size ?? 0) > MAX_IMPORT_BYTES) return { ok: false, error: { code: "tooLarge" } };
  return {
    ok: true,
    fileName: users.name.slice(0, 200),
    input: {
      format,
      users: await users.text(),
      hashes: hashFile ? await hashFile.text() : null,
      allowAdmin: format === "csv" && form.get("allowAdmin") === "1",
    },
  };
}

function failure(error: UserImportError, status = 400): { data: UserImportResponse; status: number } {
  return { data: { ok: false, error }, status };
}

export const POST = adminJsonRoute({ form: { maxBytes: MAX_REQUEST_BYTES } }, async ({ request, form, audit }) => {
  const step = new URL(request.url).searchParams.get("step");
  if (step !== "preview" && step !== "confirm") throw new ValidationError("step must be preview or confirm");
  const digest = form!.get("digest");
  if (step === "confirm" && (typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest))) {
    return failure({ code: "changed" });
  }

  const read = await readForm(form!);
  if (!read.ok) return failure(read.error, read.error.code === "tooLarge" ? 413 : 400);
  const preview = await previewImport(db, read.input, env.EMAIL_DEDUP);
  if (!preview.ok) return failure({ code: preview.error, detail: preview.detail });
  if (step === "preview") {
    return { data: { ok: true, step, summary: preview.summary } satisfies UserImportResponse };
  }
  if (typeof digest !== "string" || preview.summary.digest !== digest) return failure({ code: "changed" }, 409);

  const { summary, plan } = preview;
  const result = await commitImport(db, plan.toCreate);
  const counts: UserImportCounts = {
    ...result,
    skippedExisting: summary.skippedExisting,
    skippedAlias: summary.skippedAlias,
    invalid: summary.invalid,
  };
  // One entry per import. Admins created by it are named: they are what a reviewer looks for.
  await audit({
    action: "user.import",
    target: { type: "user_import", id: digest.slice(0, 16), label: read.fileName },
    metadata: {
      format: read.input.format,
      rows: summary.rows,
      ...counts,
      admins: summary.admins,
      adminEmails: plan.toCreate.filter((u) => u.role === "admin").slice(0, MAX_LISTED_ADMINS).map((u) => u.email),
      blocked: summary.blocked,
      passwordHashFile: read.input.hashes !== null,
      sha256: digest,
    },
  });
  return { data: { ok: true, step, counts } satisfies UserImportResponse };
});
