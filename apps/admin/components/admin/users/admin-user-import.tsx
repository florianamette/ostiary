"use client";

import * as React from "react";
import { UploadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/i18n/navigation";
import { CheckboxField } from "@/components/admin/common/choice-field";
import type { UserImportCounts, UserImportError, UserImportResponse } from "@/app/api/admin/users/import/route";
import { Alert, AlertDescription } from "@ostiary/core/components/ui/alert";
import { Button } from "@ostiary/core/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@ostiary/core/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ostiary/core/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ostiary/core/components/ui/table";
import { MAX_IMPORT_BYTES, MAX_IMPORT_USERS } from "@ostiary/core/lib/user-import/limits";
import type { ImportSummary } from "@ostiary/core/lib/user-import";

type Format = "auth0" | "csv";

const code = (chunks: React.ReactNode) => <code className="text-foreground">{chunks}</code>;

function Count({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="rounded-md border border-border/80 bg-muted/30 p-3" data-testid={testId}>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}

/**
 * Import users from an Auth0 export or a CSV file: choose the files, run the dry run, then
 * confirm. Changing a file or an option drops the dry run, so what is imported is what was shown.
 */
export function AdminUserImport() {
  const t = useTranslations("admin.pages.userImport");
  const tc = useTranslations("admin.common");
  const [format, setFormat] = React.useState<Format>("auth0");
  // Files are read from the inputs when the form is sent, so one chosen before the page
  // finished loading still counts.
  const usersInput = React.useRef<HTMLInputElement>(null);
  const hashesInput = React.useRef<HTMLInputElement>(null);
  const [allowAdmin, setAllowAdmin] = React.useState(false);
  const [summary, setSummary] = React.useState<ImportSummary | null>(null);
  const [counts, setCounts] = React.useState<UserImportCounts | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<"check" | "import" | null>(null);

  const changed = React.useCallback(() => {
    setSummary(null);
    setCounts(null);
    setError(null);
  }, []);

  /** The upload route (app/api/admin/users/import): a result, or an error already translated. */
  async function send(step: "preview" | "confirm", data: FormData): Promise<UserImportResponse | { ok: false; message: string }> {
    const response = await fetch(`/api/admin/users/import?step=${step}`, { method: "POST", body: data });
    const body = (await response.json().catch(() => null)) as { data?: UserImportResponse; error?: string } | null;
    if (body?.data) return body.data;
    if (response.status === 413) return { ok: false, error: { code: "tooLarge" } };
    return { ok: false, message: body?.error ?? tc("unexpectedError") };
  }

  function errorMessage(result: { ok: false; error: UserImportError } | { ok: false; message: string }): string {
    if ("message" in result) return result.message;
    const { code, detail } = result.error;
    if (code === "noFile" || code === "changed") return t(code);
    return t(`fileErrors.${code}`, { size: MAX_IMPORT_BYTES / 1024 / 1024, count: MAX_IMPORT_USERS, column: detail ?? "" });
  }

  function form(): FormData | null {
    const usersFile = usersInput.current?.files?.[0] ?? null;
    const hashesFile = format === "auth0" ? (hashesInput.current?.files?.[0] ?? null) : null;
    if (!usersFile) {
      setError(t("noFile"));
      return null;
    }
    if (usersFile.size + (hashesFile?.size ?? 0) > MAX_IMPORT_BYTES) {
      setError(t("fileErrors.tooLarge", { size: MAX_IMPORT_BYTES / 1024 / 1024 }));
      return null;
    }
    const data = new FormData();
    data.set("format", format);
    data.set("users", usersFile);
    if (hashesFile) data.set("hashes", hashesFile);
    if (format === "csv" && allowAdmin) data.set("allowAdmin", "1");
    return data;
  }

  async function check(e: React.FormEvent) {
    e.preventDefault();
    changed();
    const data = form();
    if (!data) return;
    setPending("check");
    try {
      const result = await send("preview", data);
      if (!result.ok) setError(errorMessage(result));
      else if (result.step === "preview") setSummary(result.summary);
    } catch {
      setError(tc("unexpectedError"));
    } finally {
      setPending(null);
    }
  }

  async function confirm() {
    const data = form();
    if (!data || !summary) return;
    setPending("import");
    setError(null);
    try {
      data.set("digest", summary.digest);
      const result = await send("confirm", data);
      if (!result.ok) {
        setError(errorMessage(result));
        return;
      }
      if (result.step !== "confirm") return;
      setSummary(null);
      setCounts(result.counts);
      if (result.counts.notImported > 0) toast.error(t("partial", { created: result.counts.created, count: result.counts.notImported }));
      else toast.success(t("done", { count: result.counts.created }));
    } catch {
      setError(tc("unexpectedError"));
    } finally {
      setPending(null);
    }
  }

  const busy = pending !== null;

  return (
    <div className="space-y-6">
      <Card>
        <form onSubmit={check}>
          <CardHeader>
            <CardTitle>{t("fileTitle")}</CardTitle>
            <CardDescription>
              {t("limits", { size: MAX_IMPORT_BYTES / 1024 / 1024, count: MAX_IMPORT_USERS })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="user-import-format">{t("format")}</FieldLabel>
                <Select
                  value={format}
                  onValueChange={(value) => {
                    setFormat(value as Format);
                    changed();
                  }}
                  disabled={busy}
                >
                  <SelectTrigger id="user-import-format" className="w-full sm:w-[320px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auth0">{t("formatAuth0")}</SelectItem>
                    <SelectItem value="csv">{t("formatCsv")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="user-import-users">{t("usersFile")}</FieldLabel>
                <Input
                  id="user-import-users"
                  ref={usersInput}
                  type="file"
                  accept={format === "csv" ? ".csv,text/csv" : ".json,.ndjson,.jsonl,application/json"}
                  disabled={busy}
                  onChange={changed}
                />
                <FieldDescription>
                  {format === "csv" ? t.rich("usersFileHelpCsv", { code }) : t("usersFileHelpAuth0")}
                </FieldDescription>
              </Field>
              {format === "auth0" ? (
                <Field>
                  <FieldLabel htmlFor="user-import-hashes">{t("hashesFile")}</FieldLabel>
                  <Input
                    id="user-import-hashes"
                    ref={hashesInput}
                    type="file"
                    accept=".json,.ndjson,.jsonl,application/json"
                    disabled={busy}
                    onChange={changed}
                  />
                  <FieldDescription>{t("hashesFileHelp")}</FieldDescription>
                </Field>
              ) : (
                <CheckboxField
                  id="user-import-allow-admin"
                  checked={allowAdmin}
                  disabled={busy}
                  onChange={(checked) => {
                    setAllowAdmin(checked);
                    changed();
                  }}
                  label={t("allowAdmin")}
                  hint={t.rich("allowAdminHelp", { code })}
                />
              )}
              <p className="text-muted-foreground text-sm">{t("notice")}</p>
              {error ? (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              ) : null}
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={busy}>
              <UploadIcon aria-hidden />
              {pending === "check" ? t("checking") : t("check")}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {summary ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("dryRunTitle")}</CardTitle>
            <CardDescription>{t("dryRunDescription", { rows: summary.rows })}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Count label={t("counts.toCreate")} value={summary.toCreate} testId="import-to-create" />
              <Count label={t("counts.skippedExisting")} value={summary.skippedExisting} testId="import-existing" />
              <Count label={t("counts.skippedAlias")} value={summary.skippedAlias} testId="import-alias" />
              <Count label={t("counts.invalid")} value={summary.invalid} testId="import-invalid" />
            </div>
            <p className="text-muted-foreground text-sm">
              {t("details", { withPassword: summary.withPassword, admins: summary.admins, blocked: summary.blocked })}
            </p>
            {summary.errors.length > 0 ? (
              <div className="space-y-2">
                <h2 className="text-sm font-medium">
                  {t("errorsTitle", { shown: summary.errors.length, total: summary.invalid })}
                </h2>
                <div className="rounded-md border border-border/80">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-20">{t("columns.row")}</TableHead>
                        <TableHead>{t("columns.email")}</TableHead>
                        <TableHead>{t("columns.reason")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.errors.map((rowError) => (
                        <TableRow key={`${rowError.row}-${rowError.reason}`}>
                          <TableCell className="tabular-nums">{rowError.row}</TableCell>
                          <TableCell className="max-w-[240px] truncate">{rowError.email ?? "—"}</TableCell>
                          <TableCell>{t(`reasons.${rowError.reason}`)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}
          </CardContent>
          <CardFooter className="gap-2">
            <Button type="button" onClick={confirm} disabled={busy || summary.toCreate === 0}>
              {pending === "import" ? t("importing") : t("confirm", { count: summary.toCreate })}
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {counts ? (
        <Alert>
          <AlertDescription className="space-y-1">
            <p role="status">{t("done", { count: counts.created })}</p>
            {counts.skippedConflict > 0 ? <p>{t("doneConflicts", { count: counts.skippedConflict })}</p> : null}
            {counts.notImported > 0 ? <p>{t("partial", { created: counts.created, count: counts.notImported })}</p> : null}
            <p>
              <Link href="/users" className="underline underline-offset-4">
                {t("viewUsers")}
              </Link>
            </p>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
