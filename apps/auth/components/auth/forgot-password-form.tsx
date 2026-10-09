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
import { useCaptcha } from "@/components/auth/captcha";
import { rateLimitMessage } from "@ostiary/core/lib/rate-limit-message";
import type { CaptchaConfig } from "@ostiary/core/lib/captcha-providers";
import { withAppContext, type AppLink } from "@/lib/app-links";

export function ForgotPasswordForm({
  className,
  captcha: captchaConfig = null,
  appLink = null,
  ...props
}: React.ComponentProps<"div"> & {
  captcha?: CaptchaConfig | null;
  /** Set during an app's sign-in: the reset link and the way back keep the app. */
  appLink?: AppLink;
}) {
  const t = useTranslations("auth.forgotPassword");
  const tLimit = useTranslations("rateLimit");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const captcha = useCaptcha(captchaConfig);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error(t("errors.emailRequired"));
      return;
    }
    const headers = captcha.headers();
    if (!headers) return;
    setIsSubmitting(true);
    try {
      const redirectTo = new URL(
        withAppContext(`/${locale}/reset-password`, appLink),
        window.location.origin,
      ).href;
      const { error } = await authClient.requestPasswordReset(
        { email: trimmed, redirectTo },
        { headers },
      );
      if (error) {
        toast.error(captcha.errorMessage(error.code) ?? rateLimitMessage(error, tLimit) ?? error.message ?? t("errors.requestFailed"));
        return;
      }
      toast.success(t("emailSent"));
    } finally {
      captcha.reset();
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
              {captcha.widget}
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
                    href={withAppContext("/login", appLink)}
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
