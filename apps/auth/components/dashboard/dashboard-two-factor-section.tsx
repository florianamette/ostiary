"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

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
import { AuthenticatorSetup, BackupCodes } from "@/components/dashboard/dashboard-two-factor-setup";
import { useDashboardSession } from "@/components/dashboard/dashboard-session";
import { useTwoFactorFlow } from "@/components/dashboard/use-two-factor-flow";

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
      <Button type="submit" variant={submitVariant} loading={busy} disabled={submitDisabled}>
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
  const { data: current } = useDashboardSession();
  const enabled = current.user.twoFactorEnabled;
  const {
    flow,
    hasPassword,
    password,
    setPassword,
    code,
    setCode,
    busy,
    open,
    close,
    startEnable,
    verifySetup,
    regenerate,
    disable,
  } = useTwoFactorFlow();

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

  /** A dialog form's submit handler: runs `action` instead of navigating. */
  const submitTo = (action: () => Promise<void>) => (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void action();
  };

  function dialogBody() {
    if (!flow) return null;

    if (flow.kind === "disable") {
      return (
        <form onSubmit={submitTo(disable)}>
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
        <form onSubmit={submitTo(isEnable ? startEnable : regenerate)}>
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
        <form onSubmit={submitTo(() => verifySetup(backupCodes))}>
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
            <Badge variant={enabled ? "default" : "secondary"}>
              {enabled ? t("statusOn") : t("statusOff")}
            </Badge>
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
                loading={busy && !flow}
                disabled={busy || hasPassword === null}
                onClick={() => open({ kind: "regenerate", step: "password" })}
              >
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
              loading={busy && !flow}
              disabled={busy || hasPassword === null}
              onClick={() => open({ kind: "enable", step: "password" })}
            >
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
