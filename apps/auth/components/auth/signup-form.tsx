"use client"

import { Loader2 } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import type { SocialProviderOption } from "@ostiary/core/lib/social-provider-meta"
import { SocialSignInButtons } from "@/components/auth/social-sign-in-buttons"
import { GoogleOneTap } from "@/components/auth/google-one-tap"
import type { GoogleOneTapConfig } from "@ostiary/core/lib/social-provider-meta"
import { toast } from "sonner"
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
import { useEffect, useState } from "react"
import { Link, useRouter } from "@/i18n/navigation"
import { authClient } from "@/lib/auth-client"
import { useCaptcha } from "@/components/auth/captcha"
import type { CaptchaConfig } from "@ostiary/core/lib/captcha-providers"
import { rateLimitMessage } from "@ostiary/core/lib/rate-limit-message"
import { withAppContext, type AppLink } from "@/lib/app-links"

export function SignupForm({
  socialProviders = [],
  captcha: captchaConfig = null,
  oneTap = null,
  appLink = null,
  ...props
}: React.ComponentProps<typeof Card> & {
  socialProviders?: SocialProviderOption[]
  captcha?: CaptchaConfig | null
  oneTap?: GoogleOneTapConfig | null
  /**
   * Set during an app's sign-in: the verification link and social sign-up restart the app's
   * authorization request, and the login link keeps the app (see lib/app-links).
   */
  appLink?: AppLink
}) {
  const t = useTranslations("auth.signup")
  const tLimit = useTranslations("rateLimit")
  const locale = useLocale()
  const router = useRouter()
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [usernameStatus, setUsernameStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");
  const [passwordMismatch, setPasswordMismatch] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const captcha = useCaptcha(captchaConfig)

  const resetForm = () => {
    setName("")
    setUsername("")
    setUsernameStatus("idle")
    setEmail("")
    setPassword("")
    setConfirmPassword("")
    setPasswordMismatch(false)
  }

  useEffect(() => {
    const trimmed = username.trim();
    if (trimmed.length < 3) {
      setUsernameStatus("idle");
      return;
    }
    if (!/^[a-zA-Z0-9_.]+$/.test(trimmed)) {
      setUsernameStatus("invalid");
      return;
    }
    setUsernameStatus("checking");
    const timer = window.setTimeout(() => {
      void (async () => {
        const { data, error } = await authClient.isUsernameAvailable({
          username: trimmed,
        });
        if (error) {
          setUsernameStatus("idle");
          return;
        }
        setUsernameStatus(data?.available ? "available" : "taken");
      })();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [username]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      setPasswordMismatch(true)
      return
    }
    setPasswordMismatch(false)

    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3) {
      toast.error(t("errors.usernameTooShort"));
      return;
    }
    if (!/^[a-zA-Z0-9_.]+$/.test(trimmedUsername)) {
      toast.error(t("errors.usernameInvalid"));
      return;
    }
    if (usernameStatus !== "available") {
      const { data } = await authClient.isUsernameAvailable({
        username: trimmedUsername,
      });
      if (!data?.available) {
        toast.error(t("errors.usernameTaken"));
        return;
      }
    }

    const headers = captcha.headers()
    if (!headers) return

    setIsSubmitting(true)
    try {
      await authClient.signUp.email(
        {
          email,
          password,
          name,
          username: trimmedUsername,
          callbackURL: appLink?.resumePath ?? `/${locale}`,
        },
        {
          headers,
          onSuccess: () => {
            resetForm()
            toast.success(t("afterRegisterRedirect"))
            router.push(withAppContext("/login", appLink, { registered: "1" }))
          },
          onError(ctx) {
            const code = ctx.error.code
            const captchaError = captcha.errorMessage(code) ?? rateLimitMessage(ctx.error, tLimit)
            if (captchaError) {
              toast.error(captchaError)
              return
            }
            if (code === "PASSWORD_COMPROMISED") {
              toast.error(t("errors.compromisedPassword"))
              return
            }
            if (
              code === "USERNAME_IS_ALREADY_TAKEN" ||
              (typeof code === "string" && code.includes("USERNAME") && code.includes("TAKEN"))
            ) {
              toast.error(t("errors.usernameTaken"));
              return;
            }
            if (
              code === "USERNAME_TOO_SHORT" ||
              code === "USERNAME_TOO_LONG" ||
              code === "INVALID_USERNAME"
            ) {
              toast.error(
                String(ctx.error.message ?? t("errors.usernameInvalid")),
              );
              return;
            }
            toast.error(
              String(ctx.error.message ?? t("errors.signUpFailed")),
            )
          },
        },
      )
    } finally {
      captcha.reset()
      setIsSubmitting(false)
    }
  }
  return (
    <Card {...props}>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">{t("fullNameLabel")}</FieldLabel>
              <Input
                id="name"
                type="text"
                placeholder={t("namePlaceholder")}
                required
                disabled={isSubmitting}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="username">{t("usernameLabel")}</FieldLabel>
              <Input
                id="username"
                type="text"
                placeholder={t("usernamePlaceholder")}
                autoComplete="username"
                required
                disabled={isSubmitting}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <FieldDescription>{t("usernameHint")}</FieldDescription>
              {username.trim().length >= 3 ? (
                <FieldDescription
                  className={
                    usernameStatus === "taken" || usernameStatus === "invalid"
                      ? "text-destructive"
                      : usernameStatus === "available"
                        ? "text-emerald-600 dark:text-emerald-500"
                        : undefined
                  }
                >
                  {usernameStatus === "checking"
                    ? t("usernameChecking")
                    : usernameStatus === "available"
                      ? t("usernameAvailable")
                      : usernameStatus === "taken"
                        ? t("usernameTaken")
                        : usernameStatus === "invalid"
                          ? t("usernameInvalidHint")
                          : null}
                </FieldDescription>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="email">{t("emailLabel")}</FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder={t("emailPlaceholder")}
                required
                disabled={isSubmitting}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <FieldDescription>{t("emailDescription")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="password">{t("passwordLabel")}</FieldLabel>
              <Input
                id="password"
                type="password"
                required
                disabled={isSubmitting}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setPasswordMismatch(false)
                }}
              />
              <FieldDescription>{t("passwordHint")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="confirm-password">
                {t("confirmPasswordLabel")}
              </FieldLabel>
              <Input
                id="confirm-password"
                type="password"
                required
                disabled={isSubmitting}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  setPasswordMismatch(false)
                }}
              />
              <FieldDescription>{t("confirmPasswordHint")}</FieldDescription>
              {passwordMismatch ? (
                <FieldDescription className="text-destructive">
                  {t("passwordMismatch")}
                </FieldDescription>
              ) : null}
            </Field>
            {captcha.widget}
            <Field>
              <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                {isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                {isSubmitting ? t("submitting") : t("submit")}
              </Button>
              <SocialSignInButtons
                providers={socialProviders}
                callbackURL={appLink?.resumePath ?? `/${locale}/dashboard`}
                disabled={isSubmitting}
              />
              <GoogleOneTap config={oneTap} callbackURL={appLink?.resumePath ?? `/${locale}/dashboard`} context="signup" />
              <FieldDescription className="text-center sm:px-6">
                {t("hasAccount")}{" "}
                <Link
                  href={withAppContext("/login", appLink)}
                  className="underline-offset-4 hover:underline"
                >
                  {t("signInLink")}
                </Link>
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
