"use client"

import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useRef, useState } from "react"
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
import type { CaptchaConfig } from "@ostiary/core/lib/captcha-providers"
import { SIGN_IN_CODE_LENGTH, SIGN_IN_CODE_MINUTES } from "@ostiary/core/lib/sign-in-code"
import { useCaptcha } from "@/components/auth/captcha"
import { authClient } from "@/lib/auth-client"

/**
 * "Email me a sign-in code": ask for a code, then type it, without leaving the page. Inside
 * an OAuth sign-in this page holds the app's request, so the code can be read on any device
 * and the app still gets its answer here. Codes only open existing accounts (see auth-factory).
 */
export function EmailCodeSignIn({
  defaultEmail,
  callbackURL,
  captcha: captchaConfig,
  onUsePassword,
  onTwoFactor,
}: {
  defaultEmail?: string
  callbackURL: string
  captcha: CaptchaConfig | null
  onUsePassword: () => void
  /** The account has two-factor authentication: the code was right, the second step is next. */
  onTwoFactor: () => void
}) {
  const t = useTranslations("auth.emailCode")
  const captcha = useCaptcha(captchaConfig)
  const [step, setStep] = useState<"email" | "code">("email")
  const [email, setEmail] = useState(defaultEmail ?? "")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const codeInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (step === "code") codeInput.current?.focus()
  }, [step])

  async function sendCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const value = email.trim()
    if (!/^[^\s@]+@[^\s@]+$/.test(value)) {
      toast.error(t("errors.invalidEmail"))
      return
    }
    const headers = captcha.headers()
    if (!headers) return
    setBusy(true)
    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp(
        { email: value, type: "sign-in" },
        { headers },
      )
      captcha.reset()
      if (error) {
        toast.error(
          captcha.errorMessage(error.code) ??
            (error.status === 429 ? t("errors.rateLimited") : t("errors.sendFailed")),
        )
        return
      }
      // Same answer whether or not the address has an account (no enumeration).
      setEmail(value)
      setCode("")
      setStep("code")
    } finally {
      setBusy(false)
    }
  }

  async function verify(otp: string) {
    if (otp.length !== SIGN_IN_CODE_LENGTH) {
      toast.error(t("errors.invalidCode"))
      return
    }
    setBusy(true)
    const { data, error } = await authClient.signIn.emailOtp({ email, otp })
    if (error) {
      setBusy(false)
      setCode("")
      codeInput.current?.focus()
      const message =
        error.code === "INVALID_OTP"
          ? t("errors.invalidCode")
          : error.code === "OTP_EXPIRED"
            ? t("errors.expired")
            : error.code === "TOO_MANY_ATTEMPTS"
              ? t("errors.tooManyAttempts")
              : error.status === 429
                ? t("errors.rateLimited")
                : // e.g. a banned account: the server's message says why.
                  error.message || t("errors.signInFailed")
      toast.error(message)
      return
    }
    if (data && "twoFactorRedirect" in data) {
      onTwoFactor()
      return
    }
    // In an OAuth sign-in the server answers with the app's redirect, which the client follows.
    if (data && "redirect" in data && data.redirect) return
    window.location.assign(callbackURL)
  }

  function onCodeChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, SIGN_IN_CODE_LENGTH)
    setCode(digits)
    // A pasted or autofilled code signs in straight away.
    if (digits.length === SIGN_IN_CODE_LENGTH && !busy) void verify(digits)
  }

  const backToPassword = (
    <FieldDescription className="text-center">
      <button
        type="button"
        className="underline underline-offset-4 hover:text-primary disabled:opacity-50"
        onClick={onUsePassword}
      >
        {t("usePassword")}
      </button>
    </FieldDescription>
  )

  if (step === "email") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void sendCode(e)}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="code-email">{t("emailLabel")}</FieldLabel>
                <Input
                  id="code-email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  placeholder={t("emailPlaceholder")}
                  value={email}
                  disabled={busy}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              {captcha.widget}
              <Field>
                <Button type="submit" disabled={busy} className="w-full sm:w-auto">
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  {busy ? t("sending") : t("send")}
                </Button>
                {backToPassword}
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("sentTitle")}</CardTitle>
        <CardDescription role="status">
          {t("sent", { email, minutes: SIGN_IN_CODE_MINUTES })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void verify(code)
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="sign-in-code">{t("codeLabel")}</FieldLabel>
              <Input
                ref={codeInput}
                id="sign-in-code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={SIGN_IN_CODE_LENGTH}
                required
                placeholder="000000"
                className="h-12 text-center font-mono text-2xl tracking-[0.5em] placeholder:text-muted-foreground/40"
                value={code}
                disabled={busy}
                onChange={(e) => onCodeChange(e.target.value)}
              />
            </Field>
            <Field>
              <Button type="submit" disabled={busy} className="w-full sm:w-auto">
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {busy ? t("verifying") : t("verify")}
              </Button>
              <FieldDescription className="text-center">
                <button
                  type="button"
                  className="underline underline-offset-4 hover:text-primary disabled:opacity-50"
                  disabled={busy}
                  onClick={() => {
                    setCode("")
                    setStep("email")
                  }}
                >
                  {t("newCode")}
                </button>
              </FieldDescription>
              {backToPassword}
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
