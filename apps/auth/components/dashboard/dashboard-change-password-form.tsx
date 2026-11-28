"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@ostiary/core/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { useAuthErrorMessage } from "@/lib/auth-error-message";


type DashboardChangePasswordFormProps = {
  onPasswordChanged?: () => void;
  /** The policy's minimum (admin console, Security). */
  minPasswordLength?: number;
  /** The policy signs the account out everywhere on a password change: the box is ticked and fixed. */
  signOutForced?: boolean;
  /** On the account page: closed behind a "Change password" button until wanted. */
  collapsible?: boolean;
};

export function DashboardChangePasswordForm({
  onPasswordChanged,
  minPasswordLength: MIN_PASSWORD_LENGTH = 8,
  signOutForced = false,
  collapsible = false,
}: DashboardChangePasswordFormProps) {
  const t = useTranslations("dashboard.security");
  const errorMessage = useAuthErrorMessage();

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [revokeOthersChoice, setRevokeOtherSessions] = React.useState(false);
  const revokeOtherSessions = signOutForced || revokeOthersChoice;
  const [passwordPending, setPasswordPending] = React.useState(false);
  const [open, setOpen] = React.useState(!collapsible);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const current = currentPassword.trim();
    const next = newPassword;
    const confirm = confirmPassword;

    if (next.length < MIN_PASSWORD_LENGTH) {
      toast.error(t("passwordTooShort", { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (next !== confirm) {
      toast.error(t("passwordMismatch"));
      return;
    }
    if (next === current) {
      toast.error(t("sameAsCurrent"));
      return;
    }

    setPasswordPending(true);
    try {
      const { error } = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions,
      });

      if (error) {
        toast.error(
          errorMessage(error, t("passwordError"), {
            PASSWORD_COMPROMISED: t("compromisedPassword"),
            INVALID_PASSWORD: t("invalidCurrentPassword"),
            // No password on the account (passkey or social sign-in only).
            CREDENTIAL_ACCOUNT_NOT_FOUND: t("invalidCurrentPassword"),
          }),
        );
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setRevokeOtherSessions(false);
      toast.success(t("passwordChanged"));
      if (collapsible) setOpen(false);

      await authClient.getSession();

      onPasswordChanged?.();
    } catch {
      toast.error(t("passwordError"));
    } finally {
      setPasswordPending(false);
    }
  }

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  if (!open) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-medium">{t("passwordHeading")}</h3>
          <FieldDescription className="text-pretty">{t("passwordHint", { min: MIN_PASSWORD_LENGTH })}</FieldDescription>
        </div>
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setOpen(true)}>
          {t("openPasswordForm")}
        </Button>
      </div>
    );
  }

  function close() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setRevokeOtherSessions(false);
    setOpen(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-sm font-medium">{t("passwordHeading")}</h3>
      <FieldDescription className="text-pretty">
        {t("passwordHint", { min: MIN_PASSWORD_LENGTH })}
      </FieldDescription>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="change-pw-current">
            {t("currentPassword")}
          </FieldLabel>
          <Input
            id="change-pw-current"
            type="password"
            // Opened from "Change password": straight to the first field.
            autoFocus={collapsible}
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            disabled={passwordPending}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="change-pw-new">{t("newPassword")}</FieldLabel>
          <Input
            id="change-pw-new"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={passwordPending}
            minLength={MIN_PASSWORD_LENGTH}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="change-pw-confirm">
            {t("confirmNewPassword")}
          </FieldLabel>
          <Input
            id="change-pw-confirm"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={passwordPending}
            minLength={MIN_PASSWORD_LENGTH}
            aria-invalid={mismatch || undefined}
            aria-describedby={mismatch ? "change-pw-mismatch" : undefined}
          />
          {mismatch ? (
            <FieldError id="change-pw-mismatch">{t("passwordMismatch")}</FieldError>
          ) : null}
        </Field>
        <Field className="rounded-lg border border-border/80 p-3">
          <div className="flex gap-3">
            <input
              id="change-pw-revoke-others"
              type="checkbox"
              className="mt-1 size-4 shrink-0 rounded border border-input accent-primary"
              checked={revokeOtherSessions}
              onChange={(e) => setRevokeOtherSessions(e.target.checked)}
              disabled={passwordPending || signOutForced}
            />
            <div className="min-w-0 space-y-1">
              <FieldLabel
                htmlFor="change-pw-revoke-others"
                className="cursor-pointer font-normal leading-snug"
              >
                {t("revokeOthersAfterChange")}
              </FieldLabel>
              <FieldDescription>
                {t("revokeOthersAfterChangeHint")}
              </FieldDescription>
            </div>
          </div>
        </Field>
        <Field className="flex-row flex-wrap gap-2">
          <Button
            type="submit"
            loading={passwordPending}
            disabled={
              !currentPassword.trim() ||
              newPassword.length < MIN_PASSWORD_LENGTH ||
              confirmPassword.length < MIN_PASSWORD_LENGTH ||
              newPassword !== confirmPassword
            }
          >
            {passwordPending ? t("changing") : t("changePassword")}
          </Button>
          {collapsible ? (
            <Button type="button" variant="ghost" disabled={passwordPending} onClick={close}>
              {t("closePasswordForm")}
            </Button>
          ) : null}
        </Field>
      </FieldGroup>
    </form>
  );
}
