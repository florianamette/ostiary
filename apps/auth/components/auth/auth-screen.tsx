import type { CSSProperties, ReactNode } from "react";

import { Logo } from "@ostiary/core/components/brand/logo";
import { brand } from "@ostiary/core/lib/brand";
import { LocaleSwitcher } from "@ostiary/core/components/layout/locale-switcher";
import { ThemeToggle } from "@ostiary/core/components/theme-toggle";
import { getTranslations } from "next-intl/server";

import { AppBrandHeader, type AppBrandIntent } from "@/components/auth/app-brand-header";
import type { AuthScreenApp } from "@ostiary/core/lib/app-branding/store";

/**
 * The brand panel's backdrop: the mark's arch drawn at full height, with brass light
 * coming through the keyhole. Dependency-free SVG; purely decorative.
 */
function Doorway() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(700px_420px_at_75%_85%,color-mix(in_oklab,var(--brass)_14%,transparent),transparent)]" />
      <svg viewBox="0 0 420 630" preserveAspectRatio="xMidYMax meet" className="absolute right-[-16%] bottom-0 h-[72%] w-auto xl:right-[-8%]">
        <defs>
          <radialGradient id="doorway-glow" cx="50%" cy="58%" r="60%">
            <stop offset="0" stopColor="var(--brass)" stopOpacity="0.32" />
            <stop offset="0.55" stopColor="var(--brass)" stopOpacity="0.07" />
            <stop offset="1" stopColor="var(--brass)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="doorway-edge" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--brass)" stopOpacity="0.8" />
            <stop offset="1" stopColor="var(--brass)" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        <path d="M40 630V250a170 170 0 0 1 340 0v380Z" fill="url(#doorway-glow)" />
        <path d="M40 630V250a170 170 0 0 1 340 0v380" fill="none" stroke="url(#doorway-edge)" strokeWidth="1.5" />
        <path d="M84 630V258a126 126 0 0 1 252 0v372" fill="none" stroke="var(--brass)" strokeOpacity="0.18" strokeWidth="1" />
        <path d="M210 296a32 32 0 0 1 15 60.2L233 410h-46l8-53.8A32 32 0 0 1 210 296Z" fill="var(--brass)" />
      </svg>
    </div>
  );
}

/**
 * The side panel's backdrop for an app with its own image: the image, darkened toward the
 * bottom so the headline and the identity provider's mark stay legible over it.
 */
function PanelImage({ src }: { src: string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Same-origin route (see /api/app-branding); never the app's own server. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="absolute inset-0 size-full object-cover" decoding="async" referrerPolicy="no-referrer" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--background)_55%,transparent),color-mix(in_oklab,var(--background)_35%,transparent)_40%,var(--background)_95%)]" />
    </div>
  );
}

/**
 * The shared shell for every auth screen (login, signup, reset, consent…):
 * a brand panel on the left and the form on the right, with the theme and
 * locale controls in the form panel's top-right corner. On small screens the brand panel collapses
 * to the wordmark above the form.
 *
 * With `app` (a verified app context, see lib/app-context.ts) the form column shows which app
 * the user is signing in to and takes its accent color through `[data-app-brand]`; the side
 * panel may show the app's headline and image. The identity provider's own mark and footer
 * always stay, so people can tell where they are typing their password.
 */
export async function AuthScreen({
  children,
  locale,
  app = null,
  appIntent = "continue",
}: {
  children: ReactNode;
  locale: string;
  app?: AuthScreenApp | null;
  /** Wording of the app header; "none" applies the colors only (the consent card names the app). */
  appIntent?: AppBrandIntent | "none";
}) {
  const t = await getTranslations({ locale, namespace: "auth.screen" });
  const ecosystem = brand.ecosystem;
  const panelText = app?.verified ? app.panelText : null;
  const panelImage = app?.verified ? app.panelImageUrl : null;
  const accent = app?.verified ? app.accent : null;

  return (
    <div className="relative grid min-h-svh lg:grid-cols-2">

      {/* Brand panel */}
      <aside className="dark relative hidden flex-col justify-between overflow-hidden border-r bg-background p-10 text-foreground lg:flex xl:p-14">
        {panelImage ? <PanelImage src={panelImage} /> : <Doorway />}
        <div className="relative">
          <Logo />
        </div>
        <div className="relative max-w-sm">
          {panelText ? (
            <h1 data-testid="app-panel-text" className="text-4xl leading-[1.05] font-semibold tracking-[-0.035em] text-pretty xl:text-5xl">
              <bdi>{panelText}</bdi>
            </h1>
          ) : (
            <>
              <h1 className="text-4xl leading-[1.05] font-semibold tracking-[-0.035em] xl:text-5xl">
                {t.rich("headline", {
                  accent: (chunks) => <span className="text-serif-accent text-brass">{chunks}</span>,
                })}
              </h1>
              <p className="mt-5 max-w-[19rem] leading-relaxed text-muted-foreground">{t("subhead", { name: brand.name })}</p>
              {ecosystem.length ? (
                <ul className="mt-8 flex flex-wrap gap-2">
                  {ecosystem.map((name) => (
                    <li key={name} className="rounded-full border bg-background/60 px-3 py-1 text-[13px] text-muted-foreground">
                      {name}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>
        <p className="relative text-xs text-muted-foreground">{t("footer", { name: brand.name })}</p>
      </aside>

      {/* Form side */}
      <div className="relative flex items-center justify-center p-6 pt-20 md:p-10 md:pt-20">
        {/* Page header controls: part of the layout, not a floating overlay. */}
        <div className="absolute right-4 top-4 flex items-center gap-2 md:right-6 md:top-6">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
        <main
          className="w-full max-w-md"
          data-app-brand={accent ? "accent" : app ? "plain" : undefined}
          style={accent ? (accent as CSSProperties) : undefined}
        >
          <div className={app && appIntent !== "none" ? "mb-6 flex justify-center lg:hidden" : "mb-8 flex justify-center lg:hidden"}>
            <Logo />
          </div>
          {app && appIntent !== "none" ? <AppBrandHeader app={app} intent={appIntent} locale={locale} /> : null}
          {children}
          {app ? (
            // On phones the side panel is hidden: say whose sign-in page this is under the form too.
            <p className="mt-6 text-center text-xs text-muted-foreground lg:hidden">{t("footer", { name: brand.name })}</p>
          ) : null}
        </main>
      </div>
    </div>
  );
}
