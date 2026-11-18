"use client"

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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@ostiary/core/components/ui/field"
import { Input } from "@ostiary/core/components/ui/input"
import { useEffect, useState } from "react"
import { Link, useRouter } from "@/i18n/navigation"
import { authClient } from "@/lib/auth-client"
import { useCaptcha } from "@/components/auth/captcha"
import type { CaptchaConfig } from "@ostiary/core/lib/captcha-providers"
import { useAuthErrorMessage } from "@/lib/auth-error-message"
import { withAppContext, type AppLink } from "@/lib/app-links"
import {
  checkUsernameAvailabilitySoon,
  hasUsernameCharacters,
  USERNAME_MIN_LENGTH,
  usernameProblem,
  type UsernameStatus,
} from "@/lib/username"
import { UsernameStatusHint } from "@/components/auth/username-status-hint"

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
  const errorMessage = useAuthErrorMessage()
  const locale = useLocale()
  const router = useRouter()
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [passwordMismatch, setPasswordMismatch] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const captcha = useCaptcha(captchaConfig)
  const socialCallbackURL = appLink?.resumePath ?? `/${locale}/dashboard`

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
    if (trimmed.length < USERNAME_MIN_LENGTH) {
      setUsernameStatus("idle");
      return;
    }
    if (!hasUsernameCharacters(trimmed)) {
      setUsernameStatus("invalid");
      return;
    }
    return checkUsernameAvailabilitySoon(trimmed, setUsernameStatus);
  }, [username]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      setPasswordMismatch(true)
      return
    }
    setPasswordMismatch(false)

    const headers = captcha.headers()
    if (!headers) return

    // Busy before the username check: it waits on the network, and a second click meanwhile
    // would send the form twice.
    setIsSubmitting(true)
    try {
      const trimmedUsername = username.trim();
      const problem = await usernameProblem(trimmedUsername, usernameStatus);
      if (problem) {
        toast.error(t(`errors.${problem}`));
        return;
      }
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
            const usernameInvalid = t("errors.usernameInvalid")
            toast.error(
              captcha.errorMessage(ctx.error.code) ??
                errorMessage(ctx.error, t("errors.signUpFailed"), {
                  PASSWORD_COMPROMISED: t("errors.compromisedPassword"),
                  USERNAME_IS_ALREADY_TAKEN: t("errors.usernameTaken"),
                  USERNAME_TOO_SHORT: usernameInvalid,
                  USERNAME_TOO_LONG: usernameInvalid,
                  INVALID_USERNAME: usernameInvalid,
                }),
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
                autoComplete="name"
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
              {username.trim().length >= USERNAME_MIN_LENGTH ? (
                <UsernameStatusHint
                  status={usernameStatus}
                  messages={{
                    checking: t("usernameChecking"),
                    available: t("usernameAvailable"),
                    taken: t("usernameTaken"),
                    invalid: t("usernameInvalidHint"),
                  }}
                />
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="email">{t("emailLabel")}</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
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
                autoComplete="new-password"
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
                autoComplete="new-password"
                required
                aria-invalid={passwordMismatch || undefined}
                aria-describedby={passwordMismatch ? "confirm-password-error" : undefined}
                disabled={isSubmitting}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  setPasswordMismatch(false)
                }}
              />
              <FieldDescription>{t("confirmPasswordHint")}</FieldDescription>
              {passwordMismatch ? (
                <FieldError id="confirm-password-error">{t("passwordMismatch")}</FieldError>
              ) : null}
            </Field>
            {captcha.widget}
            <Field>
              <Button type="submit" loading={isSubmitting} className="w-full sm:w-auto">
                {isSubmitting ? t("submitting") : t("submit")}
              </Button>
              <SocialSignInButtons
                providers={socialProviders}
                callbackURL={socialCallbackURL}
                disabled={isSubmitting}
              />
              <GoogleOneTap config={oneTap} callbackURL={socialCallbackURL} context="signup" />
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
