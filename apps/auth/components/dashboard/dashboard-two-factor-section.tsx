"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@ostiary/core/components/ui/badge";
import { Button } from "@ostiary/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ostiary/core/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { brand } from "@ostiary/core/lib/brand";
import { AuthenticatorSetup, BackupCodes } from "@/components/dashboard/dashboard-two-factor-setup";
import { authClient } from "@/lib/auth-client";
import { needsRecentSignIn, signInAgain } from "@/lib/sign-in-again";

/** What the dialog is doing: setting up (password, scan, codes), new codes, or turning off. */
type Flow =
  | { kind: "enable"; step: "password" }
  | { kind: "enable"; step: "scan"; totpURI: string; backupCodes: string[] }
  | { kind: "enable"; step: "codes"; backupCodes: string[] }
  | { kind: "regenerate"; step: "password" }
  | { kind: "regenerate"; step: "codes"; backupCodes: string[] }
  | { kind: "disable" };

type ApiError = { status?: number; code?: string; message?: string };

/** Cancel, and the form's submit button with a spinner while busy. */
function DialogFormFooter({
  busy,
  onCancel,
  submitDisabled,
  submitVariant,
  children,
}: {
  busy: boolean;
  onCancel: () => void;
  submitDisabled: boolean;
  submitVariant?: "destructive";
  children: React.ReactNode;
}) {
  const t = useTranslations("dashboard.twoFactor");
  return (
    <DialogFooter>
      <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
        {t("cancel")}
      </Button>
      <Button type="submit" variant={submitVariant} disabled={submitDisabled}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {children}
      </Button>
    </DialogFooter>
  );
}

export function DashboardTwoFactorSection({
  adminConsoleUrl,
}: {
  /** Set when this admin was sent here to turn on 2FA: "Done" then returns to the console. */
  adminConsoleUrl?: string;
}) {
  const t = useTranslations("dashboard.twoFactor");
  const locale = useLocale();
  const router = useRouter();
  const { data: sessionData, isPending } = authClient.useSession();
  const enabled = Boolean(
    (sessionData?.user as { twoFactorEnabled?: boolean | null } | undefined)?.twoFactorEnabled,
  );

  // Accounts with a password confirm it; passkey- or GitHub-only accounts have none to give.
  const [hasPassword, setHasPassword] = React.useState<boolean | null>(null);
  const [flow, setFlow] = React.useState<Flow | null>(null);
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    void authClient.listAccounts().then((res) => {
      setHasPassword(
        Array.isArray(res.data) ? res.data.some((a) => a.providerId === "credential") : true,
      );
    });
  }, []);

  function close() {
    if (busy) return;
    const finishedSetup = flow?.kind === "enable" && flow.step === "codes";
    setFlow(null);
    setPassword("");
    setCode("");
    if (finishedSetup) router.refresh();
  }

  function showError(error: ApiError) {
    if (error.code === "INVALID_PASSWORD") {
      toast.error(t("errors.invalidPassword"));
      return;
    }
    if (error.code === "INVALID_CODE") {
      toast.error(t("errors.invalidCode"));
      return;
    }
    if (needsRecentSignIn(error)) {
      toast.error(t("signInAgainToDisable"), {
        action: { label: t("signInAgain"), onClick: () => void signInAgain(locale) },
      });
      return;
    }
    if (error.status === 429) {
      toast.error(t("errors.rateLimited"));
      return;
    }
    toast.error(error.message || t("errors.generic"));
  }

  const passwordBody = () => (hasPassword ? { password } : {});

  async function startEnable() {
    setBusy(true);
    try {
      const { data, error } = await authClient.twoFactor.enable({
        ...passwordBody(),
        issuer: brand.name,
      });
      if (error) {
        showError(error);
        return;
      }
      if (!data || !("totpURI" in data) || !data.totpURI) {
        toast.error(t("errors.generic"));
        return;
      }
      setPassword("");
      setFlow({ kind: "enable", step: "scan", totpURI: data.totpURI, backupCodes: data.backupCodes ?? [] });
    } finally {
      setBusy(false);
    }
  }

  async function verifySetup(backupCodes: string[]) {
    setBusy(true);
    try {
      const { error } = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, "") });
      if (error) {
        showError(error);
        return;
      }
      setCode("");
      toast.success(t("enabled"));
      setFlow({ kind: "enable", step: "codes", backupCodes });
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    setBusy(true);
    try {
      const { data, error } = await authClient.twoFactor.generateBackupCodes(passwordBody());
      if (error) {
        showError(error);
        return;
      }
      setPassword("");
      setFlow({ kind: "regenerate", step: "codes", backupCodes: data?.backupCodes ?? [] });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const { error } = await authClient.twoFactor.disable(passwordBody());
      if (error) {
        showError(error);
        return;
      }
      toast.success(t("disabled"));
      setFlow(null);
      setPassword("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function open(next: Flow) {
    setPassword("");
    setCode("");
    // Without a password there is nothing to confirm: go straight to the action.
    if (!hasPassword && next.kind === "enable") {
      void startEnable();
      return;
    }
    if (!hasPassword && next.kind === "regenerate") {
      void regenerate();
      return;
    }
    setFlow(next);
  }

  const passwordField = hasPassword ? (
    <Field>
      <FieldLabel htmlFor="two-factor-password">{t("passwordLabel")}</FieldLabel>
      <Input
        id="two-factor-password"
        type="password"
        autoComplete="current-password"
        autoFocus
        value={password}
        disabled={busy}
        onChange={(e) => setPassword(e.target.value)}
      />
    </Field>
  ) : null;

  function dialogBody() {
    if (!flow) return null;

    if (flow.kind === "disable") {
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void disable();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("disableTitle")}</DialogTitle>
            <DialogDescription>{t("disableBody")}</DialogDescription>
          </DialogHeader>
          {passwordField ? <FieldGroup className="py-4">{passwordField}</FieldGroup> : <div className="h-4" />}
          <DialogFormFooter
            busy={busy}
            onCancel={close}
            submitVariant="destructive"
            submitDisabled={busy || (hasPassword === true && !password)}
          >
            {t("disable")}
          </DialogFormFooter>
        </form>
      );
    }

    if (flow.step === "password") {
      const isEnable = flow.kind === "enable";
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void (isEnable ? startEnable() : regenerate());
          }}
        >
          <DialogHeader>
            <DialogTitle>{isEnable ? t("setupTitle") : t("regenerateTitle")}</DialogTitle>
            <DialogDescription>{isEnable ? t("passwordHint") : t("regenerateBody")}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">{passwordField}</FieldGroup>
          <DialogFormFooter busy={busy} onCancel={close} submitDisabled={busy || !password}>
            {t("continue")}
          </DialogFormFooter>
        </form>
      );
    }

    if (flow.step === "scan") {
      const backupCodes = flow.backupCodes;
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verifySetup(backupCodes);
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("scanTitle")}</DialogTitle>
            <DialogDescription>{t("scanHint")}</DialogDescription>
          </DialogHeader>
          <AuthenticatorSetup totpURI={flow.totpURI} />
          <FieldGroup className="pb-4">
            <Field>
              <FieldLabel htmlFor="two-factor-setup-code">{t("codeLabel")}</FieldLabel>
              <Input
                id="two-factor-setup-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={8}
                className="font-mono tracking-wider"
                value={code}
                disabled={busy}
                onChange={(e) => setCode(e.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFormFooter busy={busy} onCancel={close} submitDisabled={busy || !code.trim()}>
            {t("verify")}
          </DialogFormFooter>
        </form>
      );
    }

    const finishingSetup = flow.kind === "enable";
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t("codesTitle")}</DialogTitle>
          <DialogDescription>{t("codesHint")}</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <BackupCodes codes={flow.backupCodes} />
        </div>
        <DialogFooter>
          {finishingSetup && adminConsoleUrl ? (
            <Button type="button" onClick={() => window.location.assign(adminConsoleUrl)}>
              {t("doneAdmin")}
            </Button>
          ) : (
            <Button type="button" onClick={close}>
              {t("done")}
            </Button>
          )}
        </DialogFooter>
      </>
    );
  }

  const dialogOpen = flow !== null;

  return (
    <div id="two-factor" className="scroll-mt-32 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">{t("title")}</h3>
            {isPending ? null : (
              <Badge variant={enabled ? "default" : "secondary"}>
                {enabled ? t("statusOn") : t("statusOff")}
              </Badge>
            )}
          </div>
          <FieldDescription>{t("hint")}</FieldDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          {enabled ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || hasPassword === null}
                onClick={() => open({ kind: "regenerate", step: "password" })}
              >
                {busy && !flow ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {t("regenerate")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || hasPassword === null}
                onClick={() => open({ kind: "disable" })}
              >
                {t("disable")}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || isPending || hasPassword === null}
              onClick={() => open({ kind: "enable", step: "password" })}
            >
              {busy && !flow ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {t("enable")}
            </Button>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(next) => !next && close()}>
        <DialogContent className="sm:max-w-md">{dialogBody()}</DialogContent>
      </Dialog>
    </div>
  );
}
