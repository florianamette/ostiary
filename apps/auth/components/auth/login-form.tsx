"use client"
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
import type { SocialProviderOption } from "@ostiary/core/lib/social-provider-meta"
import { brand } from "@ostiary/core/lib/brand"
import { SocialSignInButtons } from "@/components/auth/social-sign-in-buttons"
import { GoogleOneTap } from "@/components/auth/google-one-tap"
import type { GoogleOneTapConfig } from "@ostiary/core/lib/social-provider-meta"
import { authClient } from "@/lib/auth-client"
import { ResendVerification } from "@/components/auth/resend-verification"
import { EmailCodeSignIn } from "@/components/auth/email-code-sign-in"
import { useCaptcha } from "@/components/auth/captcha"
import type { CaptchaConfig } from "@ostiary/core/lib/captcha-providers"
import { safeCallbackURL } from "@/lib/safe-callback-url"
import { useAuthErrorMessage } from "@/lib/auth-error-message"
import { useLastUsedMethod } from "@/lib/last-used-method"
import { withAppContext, type AppLink } from "@/lib/app-links"

/** Sign-in responses for accounts with two-factor authentication: no session yet. */
function needsTwoFactor(data: unknown): boolean {
  return typeof data === "object" && data !== null && "twoFactorRedirect" in data
}

/**
 * After a sign-in that needs a second factor. Same query string: it carries the callbackURL
 * and, for an app's sign-in, the signed OAuth request that resumes once the code is verified.
 */
function continueToTwoFactor(locale: string) {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full load: the sign-in set a two-factor cookie
  window.location.assign(`/${locale}/two-factor${window.location.search}`)
}

/** Marks the sign-in method this browser used last. */
function LastUsedBadge({ spaced = false }: { spaced?: boolean }) {
  const t = useTranslations("auth.login")
  return (
    <Badge variant="secondary" className={spaced ? "ml-2 text-xs font-normal" : "text-xs font-normal"}>
      {t("lastUsedBadge")}
    </Badge>
  )
}

/** Better Auth's `?error=` after a failed social sign-in, as a key of auth.social. */
function socialErrorKey(error: string) {
  switch (error) {
    case "account_not_linked":
      return "notLinked"
    case "email_not_found":
      return "noEmail"
    case "signup_disabled":
      return "signUpDisabled"
    default:
      return "error"
  }
}

export function LoginForm({
  className,
  socialProviders = [],
  captcha: captchaConfig = null,
  oneTap = null,
  appLink = null,
  ...props
}: React.ComponentProps<"div"> & {
  socialProviders?: SocialProviderOption[]
  captcha?: CaptchaConfig | null
  oneTap?: GoogleOneTapConfig | null
  /** Set during an app's sign-in: sign-up and password reset keep the app (see lib/app-links). */
  appLink?: AppLink
}) {
  const t = useTranslations("auth.login")
  const errorMessage = useAuthErrorMessage()
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
  const { lastUsedMethod, lastUsedHint } = useLastUsedMethod(socialProviders);
  const [needsVerification, setNeedsVerification] = useState(false);
  // "Email me a sign-in code" replaces the card until the user goes back to their password.
  const [mode, setMode] = useState<"password" | "code">("password");
  const captcha = useCaptcha(captchaConfig);

  useEffect(() => {
    void (async () => {
      const available = await window.PublicKeyCredential?.isConditionalMediationAvailable?.().catch(() => false);
      if (!available) return;
      // Passkey autofill: errors (including a dismissed prompt) are silent.
      const res = await authClient.signIn.passkey({ autoFill: true });
      if (res.error) return;
      if (res.data) {
        window.location.assign(callbackURL);
      }
    })();
  }, [callbackURL]);

  function handleSignInError(ctx: {
    error: { status?: number; code?: string; message?: string };
  }) {
    const { status, code } = ctx.error;
    if (
      (status === 403 && code !== "BANNED_USER") ||
      code === "EMAIL_NOT_VERIFIED" ||
      (typeof code === "string" && code.includes("NOT_VERIFIED"))
    ) {
      toast.error(t("errors.emailNotVerified"));
      setNeedsVerification(true);
      return;
    }
    toast.error(captcha.errorMessage(code) ?? errorMessage(ctx.error, t("errors.signInFailed")));
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
    let leaving = false;
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
      if (needsTwoFactor(data)) continueToTwoFactor(locale);
      // Signed in: the browser is on its way to the callback (or the two-factor step), so the
      // form stays disabled rather than inviting a second submit.
      leaving = Boolean(data);
    } finally {
      if (!leaving) {
        captcha.reset();
        setIsSubmitting(false);
      }
    }
  };

  async function handlePasskeySignIn() {
    setPasskeySubmitting(true);
    let leaving = false;
    try {
      const res = await authClient.signIn.passkey({});
      if (res.error) {
        const code = "code" in res.error ? (res.error as { code?: string }).code : undefined;
        if (code === "AUTH_CANCELLED") return;
        toast.error(errorMessage(res.error, t("errors.passkeyFailed")));
        return;
      }
      if (res.data) {
        leaving = true;
        window.location.assign(callbackURL);
      }
    } finally {
      if (!leaving) setPasskeySubmitting(false);
    }
  }

  const typedEmail = loginIdentifier.includes("@") ? loginIdentifier.trim() : undefined;

  if (mode === "code") {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <EmailCodeSignIn
          defaultEmail={typedEmail}
          callbackURL={callbackURL}
          captcha={captchaConfig}
          onUsePassword={() => setMode("password")}
          onTwoFactor={() => continueToTwoFactor(locale)}
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
          defaultEmail={typedEmail}
          callbackURL={callbackURL}
        />
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{addingAccount ? t("addAccountDescription") : t("description")}</CardDescription>
          {lastUsedHint ? (
            <p className="text-xs text-muted-foreground" role="note">
              {lastUsedHint}
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
                  {lastUsedMethod === "email" || lastUsedMethod === "username" ? <LastUsedBadge /> : null}
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
                    href={withAppContext("/forgot-password", appLink)}
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
                <Button type="submit" loading={isSubmitting} disabled={passkeySubmitting} className="w-full sm:w-auto">
                  {isSubmitting ? t("submitting") : t("submit")}
                </Button>
                <Button
                  type="button"
                  variant={
                    lastUsedMethod === "passkey" ? "default" : "outline"
                  }
                  className="mt-2 w-full sm:w-auto"
                  loading={passkeySubmitting}
                  disabled={isSubmitting}
                  onClick={() => void handlePasskeySignIn()}
                >
                  {passkeySubmitting ? t("passkeySubmitting") : t("passkey")}
                  {lastUsedMethod === "passkey" && !passkeySubmitting ? <LastUsedBadge spaced /> : null}
                </Button>
                <Button
                  type="button"
                  variant={lastUsedMethod === "email-otp" ? "default" : "outline"}
                  className="mt-2 w-full sm:w-auto"
                  disabled={isSubmitting || passkeySubmitting}
                  onClick={() => setMode("code")}
                >
                  {t("emailCode")}
                  {lastUsedMethod === "email-otp" ? <LastUsedBadge spaced /> : null}
                </Button>
                <SocialSignInButtons
                  providers={socialProviders}
                  callbackURL={callbackURL}
                  newUserCallbackURL={appLink?.resumePath}
                  lastUsedMethod={lastUsedMethod}
                  disabled={isSubmitting || passkeySubmitting}
                />
                {/* Not when adding an account: someone is already signed in here. */}
                <GoogleOneTap config={addingAccount ? null : oneTap} callbackURL={callbackURL} context="signin" />
                {socialError ? (
                  <FieldDescription className="text-center text-destructive" role="alert">
                    {tSocial(socialErrorKey(socialError), { name: brand.name })}
                  </FieldDescription>
                ) : null}
                <FieldDescription className="text-center">
                  {t("noAccount")}{" "}
                  <Link href={withAppContext("/signup", appLink)} className="underline-offset-4 hover:underline">
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
