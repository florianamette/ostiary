"use client";

import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const t = useTranslations("auth.forgotPassword");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error(t("errors.emailRequired"));
      return;
    }
    setIsSubmitting(true);
    try {
      const redirectTo = new URL(
        `/${locale}/reset-password`,
        window.location.origin,
      ).href;
      const { error } = await authClient.requestPasswordReset({
        email: trimmed,
        redirectTo,
      });
      if (error) {
        toast.error(error.message ?? t("errors.requestFailed"));
        return;
      }
      toast.success(t("emailSent"));
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
                <FieldLabel htmlFor="forgot-email">{t("emailLabel")}</FieldLabel>
                <Input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  disabled={isSubmitting}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("emailPlaceholder")}
                />
                <FieldDescription>{t("emailHint")}</FieldDescription>
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
                <FieldDescription className="text-center">
                  <Link
                    href="/login"
                    className="underline-offset-4 hover:underline"
                  >
                    {t("backToLogin")}
                  </Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
