"use client";

import type * as React from "react";
import { AlertTriangleIcon, CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppIcon } from "@ostiary/core/components/app-icon";
import { Logo } from "@ostiary/core/components/brand/logo";
import { AA_TEXT, AA_UI, accentCssVariables, type accentPalette } from "@ostiary/core/lib/app-branding/color";
import { brand } from "@ostiary/core/lib/brand";
import { cn } from "@ostiary/core/lib/utils";
import type { SocialProviderOption } from "@ostiary/core/lib/social-provider-meta";

type AccentPalette = NonNullable<ReturnType<typeof accentPalette>>;

function Ratio({ label, value, min, hint }: { label: string; value: number; min: number; hint?: string }) {
  const t = useTranslations("admin.pages.applications.branding.contrast");
  const ok = value >= min;
  return (
    <li className="flex items-start gap-2">
      {ok ? (
        <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
      ) : (
        <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      )}
      <span>
        {t.rich("ratio", {
          label,
          ratio: value.toFixed(2),
          value: (chunks) => <span className="font-medium tabular-nums">{chunks}</span>,
        })}{" "}
        <span className="text-muted-foreground">{t(ok ? "passes" : "below", { min: String(min) })}</span>
        {hint ? <span className="block text-muted-foreground">{hint}</span> : null}
      </span>
    </li>
  );
}

/** The accent's contrast ratios against the WCAG AA minimums. */
export function AccentContrast({ palette }: { palette: AccentPalette }) {
  const t = useTranslations("admin.pages.applications.branding");
  return (
    <ul className="grid gap-1.5 text-xs" aria-label={t("contrast.label")}>
      <Ratio
        label={t("contrast.buttonLabel", { color: palette.foreground === "#000000" ? "black" : "white" })}
        value={palette.foregroundContrast}
        min={AA_TEXT}
      />
      <Ratio
        label={t("contrast.lightCard")}
        value={palette.light.contrast}
        min={AA_UI}
        hint={palette.light.textAdjusted ? t("contrast.textAdjusted", { color: palette.light.text, min: String(AA_TEXT) }) : undefined}
      />
      <Ratio
        label={t("contrast.darkCard")}
        value={palette.dark.contrast}
        min={AA_UI}
        hint={palette.dark.textAdjusted ? t("contrast.textAdjusted", { color: palette.dark.text, min: String(AA_TEXT) }) : undefined}
      />
    </ul>
  );
}

/**
 * The branded sign-in screen in miniature: the side panel (wide screens) and the form column,
 * with the same `[data-app-brand]` variables the auth app sets.
 */
export function BrandingPreview({
  dark,
  name,
  tagline,
  logoSrc,
  accent,
  panelText,
  panelImage,
  socialProviders,
}: {
  dark: boolean;
  name: string;
  tagline: string;
  logoSrc: string | null;
  accent: string | null;
  panelText: string;
  panelImage: string | null;
  socialProviders: SocialProviderOption[];
}) {
  const t = useTranslations("admin.pages.applications.branding.preview");
  const tScreen = useTranslations("auth.screen");
  const tApp = useTranslations("auth.app");
  const vars = accent ? (accentCssVariables(accent) as React.CSSProperties) : undefined;
  const appName = name || t("appFallback");
  return (
    <div className={cn("overflow-hidden rounded-lg border shadow-sm", dark && "dark")} aria-label={t("label")}>
      <div className="grid min-h-[22rem] grid-cols-[2fr_3fr] bg-background text-foreground">
        <div className="dark relative flex flex-col justify-between overflow-hidden border-e bg-background p-4 text-foreground">
          {panelImage ? (
            <div aria-hidden className="absolute inset-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={panelImage} alt="" className="size-full object-cover" />
              <div className="absolute inset-0 bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--background)_55%,transparent),color-mix(in_oklab,var(--background)_35%,transparent)_40%,var(--background)_95%)]" />
            </div>
          ) : null}
          <Logo className="relative scale-90 origin-top-left" />
          <p className="relative text-lg leading-tight font-semibold tracking-tight text-pretty">
            {panelText || tScreen.markup("headline", { accent: (chunks) => chunks })}
          </p>
          <p className="relative text-[10px] text-muted-foreground">{tScreen("footer", { name: brand.name })}</p>
        </div>
        <div className="flex items-center p-4" data-app-brand={accent ? "accent" : "plain"} style={vars}>
          <div className="w-full space-y-3">
            <div className="flex items-center gap-3">
              <AppIcon name={appName} src={logoSrc} size={36} />
              <div className="min-w-0 text-xs leading-snug text-muted-foreground">
                {tApp.rich("signIn", {
                  name: appName,
                  app: (chunks) => (
                    <strong className="block truncate text-sm font-semibold text-[var(--app-accent-text,var(--foreground))]">
                      {chunks}
                    </strong>
                  ),
                })}
                {tagline ? <span className="line-clamp-1 text-[11px]">{tagline}</span> : null}
              </div>
            </div>
            <div className="space-y-2 rounded-lg border bg-card p-3 text-card-foreground">
              <p className="text-sm font-semibold">{t("title")}</p>
              <div className="h-7 rounded-md border border-input bg-background/60" />
              <div className="h-7 rounded-md border border-input bg-background/60" />
              <div className="flex h-7 items-center justify-center rounded-md bg-primary text-xs font-medium text-primary-foreground">
                {t("submit")}
              </div>
              {socialProviders.length ? (
                <div className="flex flex-wrap gap-1">
                  {socialProviders.slice(0, 4).map((p) => (
                    <span key={p.id} className="rounded-md border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {p.name}
                    </span>
                  ))}
                </div>
              ) : null}
              <p className="text-[10px] text-muted-foreground">
                {t.rich("noAccount", {
                  link: (chunks) => <span className="underline decoration-[var(--ring)] underline-offset-2">{chunks}</span>,
                })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
