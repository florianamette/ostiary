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
/**
 * Only follow callbacks to this app or the admin app. The passkey path navigates on the
 * client, so without this check a crafted link could send a fresh session elsewhere.
 */
function safeCallbackURL(raw: string | null, fallback: string): string {
  if (!raw) return fallback
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw
  try {
    const target = new URL(raw)
    const allowed = [
      typeof window === "undefined" ? undefined : window.location.origin,
      process.env.NEXT_PUBLIC_APP_URL,
      process.env.NEXT_PUBLIC_ADMIN_APP_URL,
    ]
      .filter((o): o is string => Boolean(o))
      .map((o) => new URL(o).origin)
    return allowed.includes(target.origin) ? raw : fallback
  } catch {
    return fallback
  }
}

export function LoginForm({
  className,
  socialProviders = [],
  ...props
}: React.ComponentProps<"div"> & { socialProviders?: SocialProvider[] }) {
  const t = useTranslations("auth.login")
  const tSso = useTranslations("sso");
  const locale = useLocale()
  const searchParams = useSearchParams()
  const callbackURL = safeCallbackURL(searchParams.get("callbackURL"), `/${locale}`)
  const showPostRegisterHint = searchParams.get("registered") === "1"
  // Set by Better Auth when a social sign-in fails (errorCallbackURL).
  const socialError = searchParams.get("error")
  const tSocial = useTranslations("auth.social")
  const [loginIdentifier, setLoginIdentifier] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [passkeySubmitting, setPasskeySubmitting] = useState(false);
  const [lastUsedMethod, setLastUsedMethod] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);

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
    toast.error(ctx.error.message || t("errors.signInFailed"));
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = loginIdentifier.trim();
    if (!trimmed) {
      toast.error(t("errors.signInFailed"));
      return;
    }
    setIsSubmitting(true);
    try {
      const useEmail = trimmed.includes("@");
      if (useEmail) {
        await authClient.signIn.email(
          { email: trimmed, password, callbackURL },
          { onError: handleSignInError },
        );
      } else {
        await authClient.signIn.username(
          { username: trimmed, password, callbackURL },
          { onError: handleSignInError },
        );
      }
    } finally {
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
          <CardDescription>{t("description")}</CardDescription>
          {lastUsedMethod ? (
            <p className="text-xs text-muted-foreground" role="note">
              {lastUsedMethod === "email"
                ? t("lastUsedHintEmail")
                : lastUsedMethod === "username"
                  ? t("lastUsedHintUsername")
                  : lastUsedMethod === "passkey"
                    ? t("lastUsedHintPasskey")
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
