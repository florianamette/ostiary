import { ShieldAlertIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { AppIcon } from "@ostiary/core/components/app-icon";
import { brand } from "@ostiary/core/lib/brand";
import type { AuthScreenApp } from "@ostiary/core/lib/app-branding/store";

export type AppBrandIntent = "signIn" | "signUp" | "continue";

/**
 * "Sign in to continue to <app>" above the form, with the app's logo and tagline. A
 * self-registered app gets its name with an "Unverified app" warning and a monogram: its own
 * logo or colors could imitate an app people trust.
 */
export async function AppBrandHeader({
  app,
  intent,
  locale,
}: {
  app: AuthScreenApp;
  intent: AppBrandIntent;
  locale: string;
}) {
  const t = await getTranslations({ locale, namespace: "auth.app" });
  return (
    <section
      aria-label={app.name}
      data-testid="app-brand-header"
      data-client-id={app.clientId}
      data-verified={app.verified ? "true" : "false"}
      className="mb-6 flex items-center gap-4 text-start"
    >
      <AppIcon name={app.name} src={app.logoUrl} size={52} className="shadow-sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-muted-foreground">
          {t.rich(intent, {
            app: (chunks) => (
              <strong className="mt-0.5 block truncate text-lg font-semibold tracking-[-0.01em] text-[var(--app-accent-text,var(--foreground))]">
                {/* Isolated: an app name in Latin script keeps its punctuation on an RTL page. */}
                <bdi>{chunks}</bdi>
              </strong>
            ),
            name: app.name,
          })}
        </p>
        {app.verified && app.tagline ? (
          <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted-foreground"><bdi>{app.tagline}</bdi></p>
        ) : null}
        {app.verified ? null : (
          <p
            role="note"
            className="mt-2 inline-flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-950 dark:text-amber-100"
          >
            <ShieldAlertIcon className="mt-px size-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <span>
              <span className="font-medium">{t("unverified")}</span> {t("unverifiedHint", { name: brand.name })}
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
