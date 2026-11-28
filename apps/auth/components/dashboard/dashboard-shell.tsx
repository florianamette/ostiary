"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";

import { Logo } from "@ostiary/core/components/brand/logo";
import { Button } from "@ostiary/core/components/ui/button";
import { AccountMenu } from "@/components/dashboard/account-menu";
import { Link, usePathname } from "@/i18n/navigation";
import { dashboardHref, dashboardTabOf, type DashboardTab } from "@/lib/dashboard-tabs";
import { authClient } from "@/lib/auth-client";
import { cn } from "@ostiary/core/lib/utils";

function ImpersonationBanner({ email, returnUrl }: { email: string; returnUrl: string }) {
  const t = useTranslations("dashboard.impersonation");
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="border-b border-amber-500/40 bg-amber-500/10 text-sm" role="status">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-2 md:px-6">
        <span>
          {t.rich("viewingAs", {
            email,
            strong: (chunks) => <span className="font-medium">{chunks}</span>,
          })}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const { error } = await authClient.admin.stopImpersonating().catch(() => ({ error: true }));
            if (error) {
              setBusy(false);
              return;
            }
            window.location.href = returnUrl;
          }}
        >
          {t("stop")}
        </Button>
      </div>
    </div>
  );
}

export function DashboardShell({
  children,
  user,
  isAdmin,
  showOrganizations,
  showApiKeys,
  impersonation,
}: {
  children: React.ReactNode;
  user: { id: string; name: string; email: string };
  isAdmin: boolean;
  /** False when the user is only in the default Public workspace. */
  showOrganizations: boolean;
  /** True while API keys are allowed, or the user still has some. */
  showApiKeys: boolean;
  /** Set while an admin is viewing this account through impersonation. */
  impersonation: { userId: string; adminAppUrl: string | null } | null;
}) {
  const t = useTranslations("dashboard");
  const locale = useLocale();

  // Each tab is its own page (lib/dashboard-tabs.ts): the URL says which one is open.
  const activeId = dashboardTabOf(usePathname());
  const navRef = React.useRef<HTMLUListElement>(null);
  // On a narrow screen the tabs scroll sideways: keep the current one in view.
  React.useEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId]);

  const tabs: { id: DashboardTab; label: string }[] = [
    { id: "overview", label: t("nav.overview") },
    { id: "profile", label: t("nav.profile") },
    ...(showOrganizations ? [{ id: "organizations" as const, label: t("nav.organizations") }] : []),
    { id: "security", label: t("nav.security") },
    { id: "activity", label: t("nav.activity") },
    { id: "apps", label: t("nav.apps") },
    ...(showApiKeys ? [{ id: "api-keys" as const, label: t("nav.apiKeys") }] : []),
    { id: "data", label: t("nav.data") },
  ];

  return (
    <div className="flex min-h-svh flex-col bg-background">
      {impersonation ? (
        <ImpersonationBanner
          email={user.email}
          returnUrl={
            impersonation.adminAppUrl
              ? `${impersonation.adminAppUrl}/${locale}/users/${impersonation.userId}`
              : `/${locale}/dashboard`
          }
        />
      ) : null}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-4 px-4 md:px-6">
          <Link
            href="/dashboard"
            className="shrink-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Logo />
          </Link>

          <AccountMenu user={user} isAdmin={isAdmin} multiAccount={!impersonation} />
        </div>

        <nav
          className="border-t border-border/60"
          aria-label={t("navAria")}
        >
          {/* The fade on the right says the tabs go on when they overflow (phones). */}
          <ul
            ref={navRef}
            className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-2 pr-8 text-sm [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)] [scrollbar-width:none] md:px-4 md:[mask-image:none] [&::-webkit-scrollbar]:hidden"
          >
            {tabs.map((item) => {
              const isActive = item.id === activeId;
              return (
                <li key={item.id} className="shrink-0">
                  <Link
                    href={dashboardHref(item.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "relative block whitespace-nowrap rounded-md px-2.5 py-2.5 text-muted-foreground transition-colors hover:text-foreground",
                      isActive && "font-medium text-foreground",
                      "after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground after:transition-opacity",
                      isActive ? "after:opacity-100" : "after:opacity-0",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 md:px-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
