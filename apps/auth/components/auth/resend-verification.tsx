"use client"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@ostiary/core/components/ui/button"
import { Input } from "@ostiary/core/components/ui/input"
import { authClient } from "@/lib/auth-client"
import { rateLimitMessage } from "@ostiary/core/lib/rate-limit-message"

/** Lets someone who lost or never got the verification email ask for a new link. */
export function ResendVerification({
  defaultEmail,
  callbackURL,
}: {
  defaultEmail?: string
  callbackURL: string
}) {
  const t = useTranslations("auth.login.resend")
  const tLimit = useTranslations("rateLimit")
  const [email, setEmail] = useState(defaultEmail ?? "")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const value = email.trim()
    if (!value.includes("@")) {
      toast.error(t("invalidEmail"))
      return
    }
    setSending(true)
    try {
      const res = await authClient.sendVerificationEmail({ email: value, callbackURL })
      // Same answer whether or not the address has an account (no enumeration).
      if (res.error && res.error.status !== 400) {
        toast.error(rateLimitMessage(res.error, tLimit) ?? t("error"))
        return
      }
      setSent(true)
      toast.success(t("sent"))
    } finally {
      setSending(false)
    }
  }

  return (
    <form
      onSubmit={send}
      className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm"
      aria-label={t("title")}
    >
      <div>
        <p className="font-medium">{t("title")}</p>
        <p className="text-muted-foreground">{sent ? t("sent") : t("description")}</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          autoComplete="email"
          placeholder={t("emailPlaceholder")}
          value={email}
          disabled={sending}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Button type="submit" variant="outline" disabled={sending} className="shrink-0">
          {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {sent ? t("sendAgain") : t("send")}
        </Button>
      </div>
    </form>
  )
}
