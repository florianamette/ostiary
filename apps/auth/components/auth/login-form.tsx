"use client"
import { Loader2 } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { cn } from "@ostiary/core/lib/utils"
import { Badge } from "@ostiary/core/components/ui/badge"
import { Button } from "@ostiary/core/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ostiary/core/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@ostiary/core/components/ui/field"
import { Input } from "@ostiary/core/components/ui/input"
import { Link } from "@/i18n/navigation"
import type { SocialProvider } from "@ostiary/core/lib/social-provider-meta"
import { brand } from "@ostiary/core/lib/brand"
import { SocialSignInButtons } from "@/components/auth/social-sign-in-buttons"
import { authClient } from "@/lib/auth-client"
import { ResendVerification } from "@/components/auth/resend-verification"
import { EmailCodeSignIn } from "@/components/auth/email-code-sign-in"
import { useCaptcha } from "@/components/auth/captcha"
import type { CaptchaConfig } from "@ostiary/core/lib/captcha-providers"
import { safeCallbackURL } from "@/lib/safe-callback-url"

/** Sign-in responses for accounts with two-factor authentication: no session yet. */
function needsTwoFactor(data: unknown): boolean {
  return typeof data === "object" && data !== null && "twoFactorRedirect" in data
}

export function LoginForm({
  className,
  socialProviders = [],
  captcha: captchaConfig = null,
  ...props
}: React.ComponentProps<"div"> & { socialProviders?: SocialProvider[]; captcha?: CaptchaConfig | null }) {
  const t = useTranslations("auth.login")
  const tSso = useTranslations("sso");
  const locale = useLocale()
  const searchParams = useSearchParams()
  const callbackURL = safeCallbackURL(searchParams.get("callbackURL"), `/${locale}`)
  const showPostRegisterHint = searchParams.get("registered") === "1"
  // Signing in one more account (account menu, select-account page): the others stay signed in.
  const addingAccount = searchParams.get("addAccount") === "1"
  // Set by Better Auth when a social sign-in fails (errorCallbackURL).
  const socialError = searchParams.get("error")
  const tSocial = useTranslations("auth.social")
  const [loginIdentifier, setLoginIdentifier] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [passkeySubmitting, setPasskeySubmitting] = useState(false);
  const [lastUsedMethod, setLastUsedMethod] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  // "Email me a sign-in code" replaces the card until the user goes back to their password.
  const [mode, setMode] = useState<"password" | "code">("password");
  const captcha = useCaptcha(captchaConfig);

  useEffect(() => {
    const raw = authClient.getLastUsedLoginMethod();
    if (!raw) return;
    try {
      setLastUsedMethod(decodeURIComponent(raw));
    } catch {
      setLastUsedMethod(raw);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const cred = window.PublicKeyCredential;
    if (!cred?.isConditionalMediationAvailable?.()) return;
    void (async () => {
      const res = await authClient.signIn.passkey({ autoFill: true });
      if (res.error) {
        const code =
          "code" in res.error
            ? (res.error as { code?: string }).code
            : undefined;
        if (code === "AUTH_CANCELLED") return;
        return;
      }
      if (res.data) {
        window.location.assign(callbackURL);
      }
    })();
  }, [callbackURL]);

  function handleSignInError(ctx: {
    error: { status?: number; code?: string; message?: string };
  }) {
    const status = ctx.error.status;
    const code = ctx.error.code;
    if (
      status === 403 ||
      code === "EMAIL_NOT_VERIFIED" ||
      (typeof code === "string" && code.includes("NOT_VERIFIED"))
    ) {
      toast.error(t("errors.emailNotVerified"));
      setNeedsVerification(true);
      return;
    }
    toast.error(captcha.errorMessage(code) ?? (ctx.error.message || t("errors.signInFailed")));
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = loginIdentifier.trim();
    if (!trimmed) {
      toast.error(t("errors.signInFailed"));
      return;
    }
    const headers = captcha.headers();
    if (!headers) return;
    setIsSubmitting(true);
    try {
      const useEmail = trimmed.includes("@");
      const { data } = useEmail
        ? await authClient.signIn.email(
            { email: trimmed, password, callbackURL },
            { headers, onError: handleSignInError },
          )
        : await authClient.signIn.username(
            { username: trimmed, password, callbackURL },
            { headers, onError: handleSignInError },
          );
      if (needsTwoFactor(data)) {
        // Same query string: it carries the callbackURL and, for an app's sign-in, the
        // signed OAuth request that resumes once the code is verified.
        window.location.assign(`/${locale}/two-factor${window.location.search}`);
      }
    } finally {
      captcha.reset();
      setIsSubmitting(false);
    }
  };

  async function handlePasskeySignIn() {
    setPasskeySubmitting(true);
    try {
      const res = await authClient.signIn.passkey({});
      if (res.error) {
        const code =
          "code" in res.error
            ? (res.error as { code?: string }).code
            : undefined;
        if (code === "AUTH_CANCELLED") return;
        toast.error(
          String(res.error.message ?? t("errors.passkeyFailed")),
        );
        return;
      }
      if (res.data) {
        window.location.assign(callbackURL);
      }
    } finally {
      setPasskeySubmitting(false);
    }
  }

  if (mode === "code") {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <EmailCodeSignIn
          defaultEmail={loginIdentifier.includes("@") ? loginIdentifier.trim() : undefined}
          callbackURL={callbackURL}
          captcha={captchaConfig}
          onUsePassword={() => setMode("password")}
          // Same query string as after a password: callbackURL and any signed OAuth request.
          onTwoFactor={() => window.location.assign(`/${locale}/two-factor${window.location.search}`)}
        />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      {showPostRegisterHint && !needsVerification ? (
        <div
          role="status"
          className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
        >
          {t("verifyEmailAfterSignup")}
        </div>
      ) : null}
      {showPostRegisterHint || needsVerification ? (
        <ResendVerification
          defaultEmail={loginIdentifier.includes("@") ? loginIdentifier.trim() : undefined}
          callbackURL={callbackURL}
        />
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{addingAccount ? t("addAccountDescription") : t("description")}</CardDescription>
          {lastUsedMethod ? (
            <p className="text-xs text-muted-foreground" role="note">
              {lastUsedMethod === "email"
                ? t("lastUsedHintEmail")
                : lastUsedMethod === "username"
                  ? t("lastUsedHintUsername")
                  : lastUsedMethod === "passkey"
                    ? t("lastUsedHintPasskey")
                    : lastUsedMethod === "email-otp"
                      ? t("lastUsedHintEmailCode")
                      : t("lastUsedHintOther", {
                        method: formatLastUsedMethodLabel(lastUsedMethod),
                      })}
            </p>
          ) : null}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <div className="flex flex-wrap items-center gap-2">
                  <FieldLabel htmlFor="login-identifier">
                    {t("identifierLabel")}
                  </FieldLabel>
                  {lastUsedMethod === "email" || lastUsedMethod === "username" ? (
                    <Badge variant="secondary" className="text-xs font-normal">
                      {t("lastUsedBadge")}
                    </Badge>
                  ) : null}
                </div>
                <Input
                  id="login-identifier"
                  type="text"
                  placeholder={t("identifierPlaceholder")}
                  autoComplete="username webauthn"
                  required
                  value={loginIdentifier}
                  disabled={isSubmitting}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                />
              </Field>
              <Field>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <FieldLabel htmlFor="password">
                    {t("passwordLabel")}
                  </FieldLabel>
                  <Link
                    href="/forgot-password"
                    className="max-w-[min(100%,14rem)] text-right text-xs text-muted-foreground underline-offset-4 hover:underline"
                  >
                    {t("forgotPasswordLink")}
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password webauthn"
                  required
                  value={password}
                  disabled={isSubmitting}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              {captcha.widget}
              <Field>
                <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                  {isSubmitting ? (
                    <Loader2
                      className="size-4 animate-spin"
                      aria-hidden
                    />
                  ) : null}
                  {isSubmitting ? t("submitting") : t("submit")}
                </Button>
                <Button
                  type="button"
                  variant={
                    lastUsedMethod === "passkey" ? "default" : "outline"
                  }
                  className="mt-2 w-full sm:w-auto"
                  disabled={isSubmitting || passkeySubmitting}
                  onClick={() => void handlePasskeySignIn()}
                >
                  {passkeySubmitting ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : null}
                  {passkeySubmitting ? t("passkeySubmitting") : t("passkey")}
                  {lastUsedMethod === "passkey" && !passkeySubmitting ? (
                    <Badge variant="secondary" className="ml-2 text-xs font-normal">
                      {t("lastUsedBadge")}
                    </Badge>
                  ) : null}
                </Button>
                <Button
                  type="button"
                  variant={lastUsedMethod === "email-otp" ? "default" : "outline"}
                  className="mt-2 w-full sm:w-auto"
                  disabled={isSubmitting || passkeySubmitting}
                  onClick={() => setMode("code")}
                >
                  {t("emailCode")}
                  {lastUsedMethod === "email-otp" ? (
                    <Badge variant="secondary" className="ml-2 text-xs font-normal">
                      {t("lastUsedBadge")}
                    </Badge>
                  ) : null}
                </Button>
                <SocialSignInButtons
                  providers={socialProviders}
                  callbackURL={callbackURL}
                  lastUsedMethod={lastUsedMethod}
                  disabled={isSubmitting || passkeySubmitting}
                />
                {socialError ? (
                  <FieldDescription className="text-center text-destructive" role="alert">
                    {socialError === "account_not_linked" ? tSocial("notLinked", { name: brand.name }) : tSocial("error")}
                  </FieldDescription>
                ) : null}
                <FieldDescription className="text-center">
                  {t("noAccount")}{" "}
                  <Link href="/signup" className="underline-offset-4 hover:underline">
                    {t("signUpLink")}
                  </Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/sso" className="underline-offset-4 hover:underline">
          {tSso("signInLink")}
        </Link>
      </p>
      
        </CardContent>
      </Card>
    </div>
  )
}

function formatLastUsedMethodLabel(method: string): string {
  return method
    .split(/[-_]/)
    .map(
      (word) =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}
