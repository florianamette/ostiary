"use client"

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
import { PHONE_NUMBER_PATTERN } from "@ostiary/core/lib/phone-number"
import { useCaptcha } from "@/components/auth/captcha"
import { authClient } from "@/lib/auth-client"
import { useAuthErrorMessage } from "@/lib/auth-error-message"

/**
 * "Text me a sign-in code" (Better Auth's phone-number plugin, sms.ts): like the email code,
 * for accounts that verified a phone number. Same answer whether or not the number has one.
 */
export function PhoneCodeSignIn({
  callbackURL,
  captcha: captchaConfig,
  onUsePassword,
  onTwoFactor,
}: {
  callbackURL: string
  captcha: CaptchaConfig | null
  onUsePassword: () => void
  /** The account has two-factor authentication: the code was right, the second step is next. */
  onTwoFactor: () => void
}) {
  const t = useTranslations("auth.phoneCode")
  const errorMessage = useAuthErrorMessage()
  const captcha = useCaptcha(captchaConfig)
  const [step, setStep] = useState<"phone" | "code">("phone")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  // Bumped after a wrong code: focus goes back to the input once it is enabled again.
  const [attempt, setAttempt] = useState(0)
  const codeInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (step === "code") codeInput.current?.focus()
  }, [step, attempt])

  async function sendCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const value = phone.replace(/[\s().-]/g, "")
    if (!PHONE_NUMBER_PATTERN.test(value)) {
      toast.error(t("errors.invalidPhone"))
      return
    }
    const headers = captcha.headers()
    if (!headers) return
    setBusy(true)
    try {
      const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber: value }, { headers })
      captcha.reset()
      if (error) {
        toast.error(
          captcha.errorMessage(error.code) ??
            errorMessage(error, error.status === 429 ? t("errors.rateLimited") : t("errors.sendFailed")),
        )
        return
      }
      // Same answer whether or not the number has an account (no enumeration).
      setPhone(value)
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
    let leaving = false
    try {
      const { data, error } = await authClient.phoneNumber.verify({ phoneNumber: phone, code: otp })
      if (error) {
        setCode("")
        setAttempt((n) => n + 1)
        toast.error(
          errorMessage(error, error.status === 429 ? t("errors.rateLimited") : t("errors.signInFailed"), {
            INVALID_OTP: t("errors.invalidCode"),
            OTP_EXPIRED: t("errors.expired"),
            TOO_MANY_ATTEMPTS: t("errors.tooManyAttempts"),
          }),
        )
        return
      }
      // Signed in: the browser leaves for the two-factor step, the app or the callback.
      leaving = true
      if (data && "twoFactorRedirect" in data) {
        onTwoFactor()
        return
      }
      // In an OAuth sign-in the server answers with the app's redirect, which the client follows.
      if (data && "redirect" in data && data.redirect) return
      window.location.assign(callbackURL)
    } catch {
      toast.error(t("errors.signInFailed"))
    } finally {
      if (!leaving) setBusy(false)
    }
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

  if (step === "phone") {
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
                <FieldLabel htmlFor="code-phone">{t("phoneLabel")}</FieldLabel>
                <Input
                  id="code-phone"
                  type="tel"
                  autoComplete="tel"
                  autoFocus
                  required
                  placeholder="+33612345678"
                  value={phone}
                  disabled={busy}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <FieldDescription>{t("phoneHint")}</FieldDescription>
              </Field>
              {captcha.widget}
              <Field>
                <Button type="submit" loading={busy} className="w-full sm:w-auto">
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
          {t("sent", { phone, minutes: SIGN_IN_CODE_MINUTES })}
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
              <FieldLabel htmlFor="phone-sign-in-code">{t("codeLabel")}</FieldLabel>
              <Input
                ref={codeInput}
                id="phone-sign-in-code"
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
              <Button type="submit" loading={busy} className="w-full sm:w-auto">
                {busy ? t("verifying") : t("verify")}
              </Button>
              <FieldDescription className="text-center">
                <button
                  type="button"
                  className="underline underline-offset-4 hover:text-primary disabled:opacity-50"
                  disabled={busy}
                  onClick={() => {
                    setCode("")
                    setStep("phone")
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
