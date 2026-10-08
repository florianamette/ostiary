"use client";

import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

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
import { authClient } from "@/lib/auth-client";
import { safeCallbackURL } from "@/lib/safe-callback-url";
import { rateLimitMessage } from "@ostiary/core/lib/rate-limit-message";

type Method = "totp" | "backup";

/**
 * Second sign-in step for accounts with two-factor authentication. The password step left a
 * short-lived cookie; a valid code turns it into a session. The page keeps the login page's
 * query string, so an app's OAuth request resumes on its own (the server answers with a
 * redirect), and other sign-ins continue to callbackURL.
 */
export function TwoFactorForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const t = useTranslations("auth.twoFactor");
  const tLimit = useTranslations("rateLimit");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const callbackURL = safeCallbackURL(searchParams.get("callbackURL"), `/${locale}`);
  const loginHref = `/${locale}/login${searchParams.size ? `?${searchParams.toString()}` : ""}`;

  const [method, setMethod] = useState<Method>("totp");
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expired, setExpired] = useState(false);

  function switchMethod(next: Method) {
    setMethod(next);
    setCode("");
  }

  function handleError(error: { status?: number; code?: string; message?: string }) {
    switch (error.code) {
      case "INVALID_CODE":
      case "INVALID_BACKUP_CODE":
        toast.error(method === "totp" ? t("errors.invalidCode") : t("errors.invalidBackupCode"));
        return;
      case "ACCOUNT_TEMPORARILY_LOCKED":
        toast.error(t("errors.locked"));
        return;
      // The pending sign-in is gone: expired, or used up by too many wrong codes.
      case "INVALID_TWO_FACTOR_COOKIE":
      case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
        setExpired(true);
        return;
    }
    if (error.status === 429) {
      toast.error(rateLimitMessage(error, tLimit) ?? t("errors.rateLimited"));
      return;
    }
    toast.error(error.message || t("errors.failed"));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = method === "totp" ? code.replace(/\s/g, "") : code.trim();
    if (!value) return;
    setIsSubmitting(true);
    try {
      const { data, error } =
        method === "totp"
          ? await authClient.twoFactor.verifyTotp({ code: value, trustDevice })
          : await authClient.twoFactor.verifyBackupCode({ code: value, trustDevice });
      if (error) {
        handleError(error);
        return;
      }
      // An app's sign-in: the server resumed the OAuth request and the client follows its redirect.
      if (data && "redirect" in data && data.redirect) return;
      window.location.assign(callbackURL);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (expired) {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <Card>
          <CardHeader>
            <CardTitle>{t("expiredTitle")}</CardTitle>
            <CardDescription>{t("expiredDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a href={loginHref}>{t("backToLogin")}</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>
            {method === "totp" ? t("descriptionTotp") : t("descriptionBackup")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="two-factor-code">
                  {method === "totp" ? t("codeLabel") : t("backupCodeLabel")}
                </FieldLabel>
                <Input
                  key={method}
                  id="two-factor-code"
                  type="text"
                  autoComplete="one-time-code"
                  inputMode={method === "totp" ? "numeric" : "text"}
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={method === "totp" ? "123456" : "xxxxx-xxxxx"}
                  maxLength={method === "totp" ? 8 : 32}
                  className="font-mono tracking-wider"
                  autoFocus
                  required
                  value={code}
                  disabled={isSubmitting}
                  onChange={(e) => setCode(e.target.value)}
                />
              </Field>
              <Field className="rounded-lg border border-border/80 p-3">
                <div className="flex gap-3">
                  <input
                    id="two-factor-trust"
                    type="checkbox"
                    className="mt-1 size-4 shrink-0 rounded border border-input accent-primary"
                    checked={trustDevice}
                    disabled={isSubmitting}
                    onChange={(e) => setTrustDevice(e.target.checked)}
                  />
                  <div className="min-w-0 space-y-1">
                    <FieldLabel
                      htmlFor="two-factor-trust"
                      className="cursor-pointer font-normal leading-snug"
                    >
                      {t("trustDevice")}
                    </FieldLabel>
                    <FieldDescription>{t("trustDeviceHint")}</FieldDescription>
                  </div>
                </div>
              </Field>
              <Field>
                <Button type="submit" disabled={isSubmitting || !code.trim()} className="w-full sm:w-auto">
                  {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  {isSubmitting ? t("submitting") : t("submit")}
                </Button>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto justify-start px-0 text-muted-foreground"
                  disabled={isSubmitting}
                  onClick={() => switchMethod(method === "totp" ? "backup" : "totp")}
                >
                  {method === "totp" ? t("useBackupCode") : t("useAuthenticator")}
                </Button>
                <FieldDescription>
                  <a href={loginHref} className="underline-offset-4 hover:underline">
                    {t("backToLogin")}
                  </a>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
