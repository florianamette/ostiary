"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@ostiary/core/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { authClient } from "@/lib/auth-client";

const MIN_PASSWORD_LENGTH = 8;

type DashboardChangePasswordFormProps = {
  onPasswordChanged?: () => void;
};

export function DashboardChangePasswordForm({
  onPasswordChanged,
}: DashboardChangePasswordFormProps) {
  const t = useTranslations("dashboard.security");

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [revokeOtherSessions, setRevokeOtherSessions] = React.useState(false);
  const [passwordPending, setPasswordPending] = React.useState(false);

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
        const code = error.code;
        const message = error.message ?? t("passwordError");
        if (code === "PASSWORD_COMPROMISED") {
          toast.error(t("compromisedPassword"));
          return;
        }
        if (
          typeof code === "string" &&
          (code.includes("CREDENTIAL") ||
            code.includes("PASSWORD") ||
            message.toLowerCase().includes("credential"))
        ) {
          toast.error(t("invalidCurrentPassword"));
          return;
        }
        toast.error(String(message));
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setRevokeOtherSessions(false);
      toast.success(t("passwordChanged"));

      await authClient.getSession();

      onPasswordChanged?.();
    } finally {
      setPasswordPending(false);
    }
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
            aria-invalid={
              confirmPassword.length > 0 && newPassword !== confirmPassword
            }
          />
          {confirmPassword.length > 0 && newPassword !== confirmPassword ? (
            <FieldDescription className="text-destructive">
              {t("passwordMismatch")}
            </FieldDescription>
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
              disabled={passwordPending}
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
        <Field>
          <Button
            type="submit"
            disabled={
              passwordPending ||
              !currentPassword.trim() ||
              newPassword.length < MIN_PASSWORD_LENGTH ||
              confirmPassword.length < MIN_PASSWORD_LENGTH ||
              newPassword !== confirmPassword
            }
          >
            {passwordPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {passwordPending ? t("changing") : t("changePassword")}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
