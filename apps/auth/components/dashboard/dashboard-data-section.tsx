"use client";

import * as React from "react";
import { DownloadIcon, Loader2, MailCheckIcon, ShieldAlertIcon, Trash2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@ostiary/core/components/ui/alert";
import { Button } from "@ostiary/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ostiary/core/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ostiary/core/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { Skeleton } from "@ostiary/core/components/ui/skeleton";
import type { DeletionBlocker } from "@ostiary/core/lib/account-data/blockers";
import { ACCOUNT_DELETION_LINK_MINUTES } from "@ostiary/core/lib/account-data/limits";
import { rateLimitMessage } from "@ostiary/core/lib/rate-limit-message";
import { exportMyData, getDeletionStatus, type DeletionStatus, type ExportError } from "@/lib/account-data-actions";
import { authClient } from "@/lib/auth-client";
import { signInAgain } from "@/lib/sign-in-again";

/** Saves a string as a file in the browser. */
function download(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * "Your data": download everything the server stores about the account (GDPR access and
 * portability), and delete the account (erasure) after a password or recent sign-in and an
 * emailed confirmation link.
 */
export function DashboardDataSection() {
  const t = useTranslations("dashboard.data");
  const locale = useLocale();
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState<ExportError | null>(null);
  const [status, setStatus] = React.useState<DeletionStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [deleting, setDeleting] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setStatus(await getDeletionStatus());
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function exportData() {
    setExporting(true);
    setExportError(null);
    try {
      const result = await exportMyData().catch(() => ({ ok: false as const, error: "failed" as const }));
      if (!result.ok) {
        setExportError(result.error);
        return;
      }
      download(result.fileName, result.json);
      toast.success(t("exportDone"));
    } finally {
      setExporting(false);
    }
  }

  const blocked = (status?.blockers.length ?? 0) > 0;

  return (
    <section id="data" className="scroll-mt-32 space-y-6">
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>{t("exportTitle")}</CardTitle>
          <CardDescription>{t("exportDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {exportError ? (
            <Alert variant="destructive">
              <AlertDescription className="flex flex-wrap items-center gap-3">
                <span>{t(`exportErrors.${exportError}`)}</span>
                {exportError === "recentSignIn" ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => signInAgain(locale, "data")}>
                    {t("signInAgain")}
                  </Button>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
          <Button type="button" variant="outline" disabled={exporting} onClick={() => void exportData()}>
            {exporting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <DownloadIcon className="size-4" aria-hidden />}
            {t("exportButton")}
          </Button>
        </CardContent>
      </Card>

      <Card id="delete-account" className="border-destructive/40 shadow-sm">
        <CardHeader>
          <CardTitle className="text-destructive">{t("deleteTitle")}</CardTitle>
          <CardDescription>{t("deleteDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <Skeleton className="h-10 w-48" aria-busy="true" />
          ) : status ? (
            <>
              {status.blockers.map((blocker) => (
                <BlockerAlert key={blocker.kind} blocker={blocker} />
              ))}
              {status.impersonating ? (
                <p className="text-sm text-muted-foreground">{t("deleteErrors.impersonating")}</p>
              ) : null}
              <Button
                type="button"
                variant="destructive"
                disabled={blocked || status.impersonating}
                onClick={() => setDeleting(true)}
              >
                <Trash2Icon className="size-4" aria-hidden />
                {t("deleteButton")}
              </Button>
            </>
          ) : (
            <p className="text-sm text-destructive" role="alert">
              {t("loadError")}
            </p>
          )}
        </CardContent>
      </Card>

      {deleting && status ? (
        <DeleteAccountDialog
          status={status}
          onClose={() => {
            setDeleting(false);
            void load();
          }}
        />
      ) : null}
    </section>
  );
}

function BlockerAlert({ blocker }: { blocker: DeletionBlocker }) {
  const t = useTranslations("dashboard.data.blockers");
  const names = "organizations" in blocker ? blocker.organizations.map((o) => o.name).join(", ") : "";
  return (
    <Alert>
      <ShieldAlertIcon aria-hidden />
      <AlertTitle>{t(`${blocker.kind}.title`)}</AlertTitle>
      <AlertDescription>
        {blocker.kind === "admin"
          ? t("admin.body")
          : blocker.kind === "sole_owner"
            ? t("sole_owner.body", { organizations: names })
            : names
              ? t("scim.bodyNamed", { organizations: names })
              : t("scim.body")}
      </AlertDescription>
    </Alert>
  );
}

type DeleteError =
  | "mismatch"
  | "password"
  | "wrongPassword"
  | "recentSignIn"
  | "blocked"
  | "impersonating"
  | "failed";

/** Better Auth's /delete-user error, as one of the dialog's messages. */
function deleteErrorKey(error: { status?: number; code?: string } | null | undefined): DeleteError {
  switch (error?.code) {
    case "INVALID_PASSWORD":
      return "wrongPassword";
    case "PASSWORD_REQUIRED":
      return "password";
    case "RECENT_SIGN_IN_REQUIRED":
    case "SESSION_EXPIRED":
      return "recentSignIn";
    case "ACCOUNT_DELETION_BLOCKED":
      return "blocked";
    case "IMPERSONATING":
      return "impersonating";
    default:
      return "failed";
  }
}

function DeleteAccountDialog({ status, onClose }: { status: DeletionStatus; onClose: () => void }) {
  const t = useTranslations("dashboard.data");
  const tLimit = useTranslations("rateLimit");
  const locale = useLocale();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<{ key: DeleteError; limited?: string | null } | null>(null);
  const [sent, setSent] = React.useState(false);
  // Without a password, a sign-in from the last 10 minutes stands in for it.
  const needsSignIn = !status.hasPassword && status.recentSignInSecondsLeft === 0;
  const emailMatches = email.trim().toLowerCase() === status.email.toLowerCase();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!emailMatches) {
      setError({ key: "mismatch" });
      return;
    }
    if (status.hasPassword && !password) {
      setError({ key: "password" });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: failure } = await authClient.deleteUser(status.hasPassword ? { password } : {});
      if (failure) {
        setError({ key: deleteErrorKey(failure), limited: rateLimitMessage(failure, tLimit) });
        return;
      }
      setSent(true);
    } catch {
      setError({ key: "failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {sent ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MailCheckIcon className="size-5" aria-hidden />
                {t("sentTitle")}
              </DialogTitle>
              <DialogDescription>{t("sentBody", { email: status.email, minutes: ACCOUNT_DELETION_LINK_MINUTES })}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" onClick={onClose}>
                {t("done")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t("confirmTitle")}</DialogTitle>
              <DialogDescription>{t("confirmDescription")}</DialogDescription>
            </DialogHeader>
            <ul className="list-disc space-y-1.5 ps-5 text-sm text-muted-foreground">
              <li>{t("consequences.signIn")}</li>
              <li>{t("consequences.apps")}</li>
              <li>{t("consequences.data")}</li>
              <li>{t("consequences.records")}</li>
            </ul>
            <p className="text-sm text-muted-foreground">{t("exportFirst")}</p>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="delete-confirm-email">{t("typeEmail", { email: status.email })}</FieldLabel>
                <Input
                  id="delete-confirm-email"
                  type="email"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={status.email}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={busy}
                />
              </Field>
              {status.hasPassword ? (
                <Field>
                  <FieldLabel htmlFor="delete-confirm-password">{t("password")}</FieldLabel>
                  <Input
                    id="delete-confirm-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={busy}
                  />
                </Field>
              ) : (
                <FieldDescription>{needsSignIn ? t("signInFirst") : t("noPassword")}</FieldDescription>
              )}
            </FieldGroup>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error.limited ?? t(`deleteErrors.${error.key}`)}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
                {t("cancel")}
              </Button>
              {needsSignIn || error?.key === "recentSignIn" ? (
                <Button type="button" onClick={() => signInAgain(locale, "data")}>
                  {t("signInAgain")}
                </Button>
              ) : (
                <Button type="submit" variant="destructive" disabled={busy || !emailMatches}>
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  {t("sendLink")}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
