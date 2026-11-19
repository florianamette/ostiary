"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
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
import { AuthCard } from "@/components/auth/auth-card";
import { safeCallbackURL } from "@/lib/safe-callback-url";
import { useAuthErrorMessage } from "@/lib/auth-error-message";

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
  const errorMessage = useAuthErrorMessage();
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
      // The pending sign-in is gone: expired, or used up by too many wrong codes.
      case "INVALID_TWO_FACTOR_COOKIE":
      case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
        setExpired(true);
        return;
    }
    const wrongCode = method === "totp" ? t("errors.invalidCode") : t("errors.invalidBackupCode");
    toast.error(
      errorMessage(error, error.status === 429 ? t("errors.rateLimited") : t("errors.failed"), {
        INVALID_CODE: wrongCode,
        INVALID_BACKUP_CODE: wrongCode,
        ACCOUNT_TEMPORARILY_LOCKED: t("errors.locked"),
      }),
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = method === "totp" ? code.replace(/\s/g, "") : code.trim();
    if (!value) return;
    setIsSubmitting(true);
    let leaving = false;
    try {
      const { data, error } =
        method === "totp"
          ? await authClient.twoFactor.verifyTotp({ code: value, trustDevice })
          : await authClient.twoFactor.verifyBackupCode({ code: value, trustDevice });
      if (error) {
        handleError(error);
        return;
      }
      // Signed in: the form stays disabled while the browser leaves.
      leaving = true;
      // An app's sign-in: the server resumed the OAuth request and the client follows its redirect.
      if (data && "redirect" in data && data.redirect) return;
      window.location.assign(callbackURL);
    } catch {
      toast.error(t("errors.failed"));
    } finally {
      if (!leaving) setIsSubmitting(false);
    }
  }

  if (expired) {
    return (
      <AuthCard
        className={className}
        {...props}
        heading={t("expiredTitle")}
        description={t("expiredDescription")}
      >
        <Button asChild>
          <a href={loginHref}>{t("backToLogin")}</a>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      className={className}
      {...props}
      heading={t("title")}
      description={method === "totp" ? t("descriptionTotp") : t("descriptionBackup")}
    >
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
            <Button type="submit" loading={isSubmitting} disabled={!code.trim()} className="w-full sm:w-auto">
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
    </AuthCard>
  );
}
