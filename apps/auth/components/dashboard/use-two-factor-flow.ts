"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { brand } from "@ostiary/core/lib/brand";
import { authClient } from "@/lib/auth-client";
import { useAuthErrorMessage, type AuthClientError } from "@/lib/auth-error-message";
import { needsRecentSignIn, signInAgain } from "@/lib/sign-in-again";

/** What the dialog is doing: setting up (password, scan, codes), new codes, or turning off. */
export type Flow =
  | { kind: "enable"; step: "password" }
  | { kind: "enable"; step: "scan"; totpURI: string; backupCodes: string[] }
  | { kind: "enable"; step: "codes"; backupCodes: string[] }
  | { kind: "regenerate"; step: "password" }
  | { kind: "regenerate"; step: "codes"; backupCodes: string[] }
  | { kind: "disable" };

/**
 * The two-factor section's steps and calls: turn on (password, scan, backup codes), new backup
 * codes, turn off. The section renders the dialog for `flow`; this hook owns the state and
 * talks to Better Auth.
 */
export function useTwoFactorFlow() {
  const t = useTranslations("dashboard.twoFactor");
  const locale = useLocale();
  const router = useRouter();
  const errorMessage = useAuthErrorMessage();

  // Accounts with a password confirm it; passkey- or GitHub-only accounts have none to give.
  const [hasPassword, setHasPassword] = React.useState<boolean | null>(null);
  const [flow, setFlow] = React.useState<Flow | null>(null);
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    authClient
      .listAccounts()
      .then((res) => (Array.isArray(res.data) ? res.data.some((a) => a.providerId === "credential") : true))
      // Unknown: ask for the password; the server refuses it if the account has none.
      .catch(() => true)
      .then(setHasPassword);
  }, []);

  function close() {
    if (busy) return;
    const finishedSetup = flow?.kind === "enable" && flow.step === "codes";
    setFlow(null);
    setPassword("");
    setCode("");
    if (finishedSetup) router.refresh();
  }

  function showError(error: NonNullable<AuthClientError>) {
    if (needsRecentSignIn(error)) {
      toast.error(t("signInAgainToDisable"), {
        action: { label: t("signInAgain"), onClick: () => void signInAgain(locale) },
      });
      return;
    }
    toast.error(
      errorMessage(error, error.status === 429 ? t("errors.rateLimited") : t("errors.generic"), {
        INVALID_PASSWORD: t("errors.invalidPassword"),
        INVALID_CODE: t("errors.invalidCode"),
      }),
    );
  }

  const passwordBody = () => (hasPassword ? { password } : {});

  async function whileBusy(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  function startEnable() {
    return whileBusy(async () => {
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
    });
  }

  function verifySetup(backupCodes: string[]) {
    return whileBusy(async () => {
      const { error } = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, "") });
      if (error) {
        showError(error);
        return;
      }
      setCode("");
      toast.success(t("enabled"));
      setFlow({ kind: "enable", step: "codes", backupCodes });
    });
  }

  function regenerate() {
    return whileBusy(async () => {
      const { data, error } = await authClient.twoFactor.generateBackupCodes(passwordBody());
      if (error) {
        showError(error);
        return;
      }
      setPassword("");
      setFlow({ kind: "regenerate", step: "codes", backupCodes: data?.backupCodes ?? [] });
    });
  }

  function disable() {
    return whileBusy(async () => {
      const { error } = await authClient.twoFactor.disable(passwordBody());
      if (error) {
        showError(error);
        return;
      }
      toast.success(t("disabled"));
      setFlow(null);
      setPassword("");
      router.refresh();
    });
  }

  function open(next: Flow) {
    setPassword("");
    setCode("");
    // Without a password there is nothing to confirm: go straight to the action.
    if (!hasPassword && next.kind !== "disable") {
      void (next.kind === "enable" ? startEnable() : regenerate());
      return;
    }
    setFlow(next);
  }

  return {
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
  };
}
