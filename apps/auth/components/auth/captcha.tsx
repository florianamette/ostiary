"use client"

import { useLocale, useTranslations } from "next-intl"
import { useTheme } from "next-themes"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  CAPTCHA_RESPONSE_HEADER,
  CAPTCHA_WIDGETS,
  type CaptchaConfig,
} from "@ostiary/core/lib/captcha-providers"

/** What Turnstile, hCaptcha and reCAPTCHA v2 have in common: explicit render, reset, remove. */
type WidgetApi = {
  render: (element: HTMLElement, params: Record<string, unknown>) => string | number
  reset: (id?: string | number) => void
  remove?: (id: string | number) => void
}

const ONLOAD = "__ostiaryCaptchaLoaded"
let loading: Promise<WidgetApi> | null = null

/** Loads the provider's script once per page (a deployment has a single provider). */
function loadWidgetApi(config: CaptchaConfig, lang: string): Promise<WidgetApi> {
  const widget = CAPTCHA_WIDGETS[config.provider]
  const globals = window as unknown as Record<string, unknown>
  if (loading) return loading
  loading = new Promise<WidgetApi>((resolve, reject) => {
    globals[ONLOAD] = () => resolve(globals[widget.global] as WidgetApi)
    const script = document.createElement("script")
    script.src = widget.script(ONLOAD, lang)
    script.async = true
    script.onerror = () => {
      // Blocked or offline: let a later render try again.
      loading = null
      script.remove()
      reject(new Error(`Could not load ${config.provider}`))
    }
    document.head.appendChild(script)
  })
  return loading
}

/** The widgets' language codes, from the app's locale segment. */
function widgetLanguage(locale: string): string {
  if (locale === "cn") return "zh-CN"
  return locale
}

/**
 * The captcha for one form, when the deployment has one (CAPTCHA_* variables). Render
 * `widget` above the submit button; `headers()` gives the request headers carrying the
 * solved token, or null (and a hint under the widget) while it is unsolved. Each token
 * works once, so call `reset()` after every request that used it, successful or not.
 * With captcha off, `widget` is null and `headers()` is always `{}`.
 */
export function useCaptcha(config: CaptchaConfig | null) {
  const t = useTranslations("captcha")
  const [token, setToken] = useState<string | null>(null)
  const [generation, setGeneration] = useState(0)
  const [hint, setHint] = useState<"required" | "unavailable" | null>(null)

  const reset = useCallback(() => {
    setToken(null)
    setGeneration((g) => g + 1)
  }, [])

  const onToken = useCallback((value: string | null) => {
    setToken(value)
    if (value) setHint(null)
  }, [])

  const headers = useCallback((): Record<string, string> | null => {
    if (!config) return {}
    if (!token) {
      setHint((current) => current ?? "required")
      return null
    }
    return { [CAPTCHA_RESPONSE_HEADER]: token }
  }, [config, token])

  /** A translated message for the captcha plugin's error codes, else undefined. */
  const errorMessage = useCallback(
    (code: string | undefined) =>
      code === "VERIFICATION_FAILED" || code === "MISSING_RESPONSE" ? t("failed") : undefined,
    [t],
  )

  const widget = config ? (
    <div className="flex flex-col gap-1.5">
      <CaptchaWidget
        config={config}
        generation={generation}
        label={t("label")}
        onToken={onToken}
        unavailable={hint === "unavailable"}
        onUnavailable={() => setHint("unavailable")}
      />
      {hint ? (
        <p role="alert" className="text-sm text-destructive">
          {t(hint)}
        </p>
      ) : null}
    </div>
  ) : null

  return { widget, headers, reset, errorMessage }
}

function CaptchaWidget({
  config,
  generation,
  label,
  unavailable,
  onToken,
  onUnavailable,
}: {
  config: CaptchaConfig
  generation: number
  label: string
  unavailable: boolean
  onToken: (token: string | null) => void
  onUnavailable: () => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const locale = useLocale()
  const { resolvedTheme } = useTheme()
  const theme = resolvedTheme === "dark" ? "dark" : "light"

  useEffect(() => {
    // Wait for next-themes so the widget is drawn once, in the right theme.
    if (!resolvedTheme || !container.current) return
    let cancelled = false
    let api: WidgetApi | null = null
    let id: string | number | undefined
    // A fresh element per render: reCAPTCHA cannot render twice into the same one.
    const target = document.createElement("div")
    container.current.appendChild(target)
    onToken(null)

    loadWidgetApi(config, widgetLanguage(locale))
      .then((loaded) => {
        if (cancelled) return
        api = loaded
        id = loaded.render(target, {
          sitekey: config.siteKey,
          theme,
          // Turnstile: as wide as the form, or its compact size where the form is narrower than
          // the 300px its flexible size needs (small phones). The others have a fixed size.
          ...(config.provider === "cloudflare-turnstile"
            ? { size: target.offsetWidth >= 300 ? "flexible" : "compact" }
            : {}),
          callback: (value: string) => onToken(value),
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
        })
      })
      .catch(() => {
        if (!cancelled) onUnavailable()
      })

    return () => {
      cancelled = true
      if (api && id !== undefined) api.remove?.(id)
      target.remove()
    }
    // onUnavailable is recreated on each render; the widget only follows the values below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, locale, theme, resolvedTheme, generation, onToken])

  return (
    <div
      ref={container}
      role="group"
      aria-label={label}
      // Reserve the widget's height so the form does not jump when it appears.
      className={
        unavailable ? undefined : config.provider === "cloudflare-turnstile" ? "min-h-[65px]" : "min-h-[78px]"
      }
    />
  )
}
