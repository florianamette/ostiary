"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useState } from "react";
import { Button } from "@ostiary/core/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { Link, useRouter } from "@/i18n/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { authClient } from "@/lib/auth-client";
import { withAppContext, type AppLink } from "@/lib/app-links";
import { useAuthErrorMessage } from "@/lib/auth-error-message";

export function ResetPasswordForm({
  className,
  appLink = null,
  ...props
}: React.ComponentProps<"div"> & {
  /** Set when the reset started from an app's sign-in: back to that app's login. */
  appLink?: AppLink;
}) {
  const t = useTranslations("auth.resetPassword");
  const router = useRouter();
  const errorMessage = useAuthErrorMessage();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const errorParam = searchParams.get("error");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (errorParam === "INVALID_TOKEN") {
    return (
      <AuthCard
        className={className}
        {...props}
        heading={t("invalidTokenTitle")}
        description={t("invalidTokenDescription")}
      >
        <Button asChild variant="default">
          <Link href={withAppContext("/forgot-password", appLink)}>{t("requestNewLink")}</Link>
        </Button>
      </AuthCard>
    );
  }

  if (!token) {
    return (
      <AuthCard
        className={className}
        {...props}
        heading={t("missingTokenTitle")}
        description={t("missingTokenDescription")}
        contentClassName="flex flex-col gap-2"
      >
        <Button asChild variant="outline">
          <Link href={withAppContext("/forgot-password", appLink)}>{t("requestNewLink")}</Link>
        </Button>
        <Button asChild variant="ghost" className="self-start">
          <Link href={withAppContext("/login", appLink)}>{t("backToLogin")}</Link>
        </Button>
      </AuthCard>
    );
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setPasswordMismatch(true);
      return;
    }
    setPasswordMismatch(false);
    setIsSubmitting(true);
    try {
      const { error } = await authClient.resetPassword({
        token,
        newPassword: password,
      });
      if (error) {
        // A breached password (PASSWORD_COMPROMISED) and an expired link get their own wording.
        toast.error(errorMessage(error, t("errors.resetFailed")));
        return;
      }
      toast.success(t("success"));
      router.push(withAppContext("/login", appLink));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard className={className} {...props} heading={t("title")} description={t("description")}>
      <form onSubmit={(e) => void handleSubmit(e)}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="reset-password">
              {t("newPasswordLabel")}
            </FieldLabel>
            <Input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              disabled={isSubmitting}
              onChange={(e) => setPassword(e.target.value)}
            />
            <FieldDescription>{t("passwordHint")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="reset-password-confirm">
              {t("confirmPasswordLabel")}
            </FieldLabel>
            <Input
              id="reset-password-confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              disabled={isSubmitting}
              aria-invalid={passwordMismatch || undefined}
              aria-describedby={passwordMismatch ? "reset-password-mismatch" : undefined}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setPasswordMismatch(false);
              }}
            />
            {passwordMismatch ? (
              <FieldError id="reset-password-mismatch">{t("passwordMismatch")}</FieldError>
            ) : null}
          </Field>
          <Field>
            <Button
              type="submit"
              loading={isSubmitting}
              className="w-full sm:w-auto"
            >
              {isSubmitting ? t("submitting") : t("submit")}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}
