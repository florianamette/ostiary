"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useState } from "react";
import { cn } from "@ostiary/core/lib/utils";
import { Button } from "@ostiary/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ostiary/core/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const t = useTranslations("auth.resetPassword");
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const errorParam = searchParams.get("error");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (errorParam === "INVALID_TOKEN") {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <Card>
          <CardHeader>
            <CardTitle>{t("invalidTokenTitle")}</CardTitle>
            <CardDescription>{t("invalidTokenDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="default">
              <Link href="/forgot-password">{t("requestNewLink")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!token) {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <Card>
          <CardHeader>
            <CardTitle>{t("missingTokenTitle")}</CardTitle>
            <CardDescription>{t("missingTokenDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button asChild variant="outline">
              <Link href="/forgot-password">{t("requestNewLink")}</Link>
            </Button>
            <Button asChild variant="ghost" className="self-start">
              <Link href="/login">{t("backToLogin")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
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
        toast.error(error.message ?? t("errors.resetFailed"));
        return;
      }
      toast.success(t("success"));
      router.push("/login");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
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
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                {passwordMismatch ? (
                  <p className="text-sm text-destructive" role="alert">
                    {t("passwordMismatch")}
                  </p>
                ) : null}
              </Field>
              <Field>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto"
                >
                  {isSubmitting ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : null}
                  {isSubmitting ? t("submitting") : t("submit")}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
