"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { db } from "@ostiary/core/db/index";
import { env } from "@ostiary/core/lib/env";
import {
  commitImport,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_USERS,
  previewImport,
  type ImportFormat,
  type ImportInput,
  type ImportPreview,
  type ImportResult,
  type ImportSummary,
} from "@ostiary/core/lib/user-import";

import { adminAction, type AdminActor } from "@/lib/admin-action";

/*
 * Bulk user import (docs/import-users.md, lib/user-import). The browser sends the files with
 * each call: the dry run keeps nothing on the server, and the confirmation parses and checks
 * them again, against the database as it is then. The digest makes sure it imports what the
 * admin saw in the dry run.
 */

type Failure = { ok: false; error: string };

export type UserImportCounts = ImportResult & Pick<ImportSummary, "skippedExisting" | "skippedAlias" | "invalid">;

const MAX_LISTED_ADMINS = 100;

/** The form, read without trusting it: known fields only, the files' sizes before their bytes. */
async function readForm(form: FormData): Promise<{ ok: true; input: ImportInput; fileName: string } | { ok: false; error: "noFile" | "tooLarge" }> {
  const format: ImportFormat = form.get("format") === "csv" ? "csv" : "auth0";
  const users = form.get("users");
  const hashes = format === "auth0" ? form.get("hashes") : null;
  if (!(users instanceof File) || users.size === 0) return { ok: false, error: "noFile" };
  const hashFile = hashes instanceof File && hashes.size > 0 ? hashes : null;
  if (users.size + (hashFile?.size ?? 0) > MAX_IMPORT_BYTES) return { ok: false, error: "tooLarge" };
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

async function failure(error: "noFile" | "tooLarge" | Extract<ImportPreview, { ok: false }>): Promise<Failure> {
  const t = await getTranslations("admin.pages.userImport");
  if (error === "noFile") return { ok: false, error: t("noFile") };
  if (error === "tooLarge") return { ok: false, error: t("fileErrors.tooLarge", { size: MAX_IMPORT_BYTES / 1024 / 1024 }) };
  return {
    ok: false,
    error: t(`fileErrors.${error.error}`, { size: MAX_IMPORT_BYTES / 1024 / 1024, count: MAX_IMPORT_USERS, column: error.detail ?? "" }),
  };
}

/** The dry run: what the import would do. Writes nothing. */
export async function previewUserImport(form: FormData): Promise<{ ok: true; summary: ImportSummary } | Failure> {
  return adminAction(z.tuple([z.instanceof(FormData)]), [form], ([form]) => previewUserImportRun(form));
}

async function previewUserImportRun(form: FormData): Promise<{ ok: true; summary: ImportSummary } | Failure> {
  const read = await readForm(form);
  if (!read.ok) return failure(read.error);
  const preview = await previewImport(db, read.input, env.EMAIL_DEDUP);
  if (!preview.ok) return failure(preview);
  return { ok: true, summary: preview.summary };
}

/** The import, once the admin confirmed the dry run with this digest. */
export async function confirmUserImport(form: FormData, digest: string): Promise<{ ok: true; counts: UserImportCounts } | Failure> {
  return adminAction(
    z.tuple([z.instanceof(FormData), z.string().regex(/^[0-9a-f]{64}$/)]),
    [form, digest],
    ([form, digest], actor) => confirmUserImportRun(form, digest, actor),
  );
}

async function confirmUserImportRun(form: FormData, digest: string, actor: AdminActor): Promise<{ ok: true; counts: UserImportCounts } | Failure> {
  const t = await getTranslations("admin.pages.userImport");
  const read = await readForm(form);
  if (!read.ok) return failure(read.error);
  const preview = await previewImport(db, read.input, env.EMAIL_DEDUP);
  if (!preview.ok) return failure(preview);
  if (preview.summary.digest !== digest) return { ok: false, error: t("changed") };

  const { summary, plan } = preview;
  const result = await commitImport(db, plan.toCreate);
  const counts: UserImportCounts = {
    ...result,
    skippedExisting: summary.skippedExisting,
    skippedAlias: summary.skippedAlias,
    invalid: summary.invalid,
  };
  // One entry per import. Admins created by it are named: they are what a reviewer looks for.
  await actor.audit({
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
  return { ok: true, counts };
}
