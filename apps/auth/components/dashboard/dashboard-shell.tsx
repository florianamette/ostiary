"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";

import { Logo } from "@ostiary/core/components/brand/logo";
import { Button } from "@ostiary/core/components/ui/button";
import { AccountMenu } from "@/components/dashboard/account-menu";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { cn } from "@ostiary/core/lib/utils";

const SECTION_IDS = ["overview", "profile", "organizations", "security", "apps", "api-keys", "data"];

/**
 * Tracks which dashboard section is in the reading band near the top of the
 * viewport, so the tab bar can highlight the section the user is looking at.
 */
function useActiveSection(ids: string[]) {
  const [activeId, setActiveId] = React.useState(ids[0]);

  React.useEffect(() => {
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) =>
              a.boundingClientRect.top - b.boundingClientRect.top,
          );
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-120px 0px -60% 0px" },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids]);

  return activeId;
}

function ImpersonationBanner({ email, returnUrl }: { email: string; returnUrl: string }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="border-b border-amber-500/40 bg-amber-500/10 text-sm" role="status">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-2 md:px-6">
        <span>
          You are viewing this account as <span className="font-medium">{email}</span>.
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const { error } = await authClient.admin.stopImpersonating();
            if (error) {
              setBusy(false);
              return;
            }
            window.location.href = returnUrl;
          }}
        >
          Stop impersonating
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

  const sectionIds = React.useMemo(
    () =>
      SECTION_IDS.filter(
        (id) => (showOrganizations || id !== "organizations") && (showApiKeys || id !== "api-keys"),
      ),
    [showOrganizations, showApiKeys],
  );
  const activeId = useActiveSection(sectionIds);

  const sections = [
    { id: "overview", href: "/dashboard", label: t("nav.overview") },
    { id: "profile", href: "/dashboard#profile", label: t("nav.profile") },
    {
      id: "organizations",
      href: "/dashboard#organizations",
      label: t("nav.organizations"),
    },
    { id: "security", href: "/dashboard#security", label: t("nav.security") },
    { id: "apps", href: "/dashboard#apps", label: t("nav.apps") },
    { id: "api-keys", href: "/dashboard#api-keys", label: t("nav.apiKeys") },
    { id: "data", href: "/dashboard#data", label: t("nav.data") },
  ].filter((item) => sectionIds.includes(item.id));

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
          <ul className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-2 text-sm [scrollbar-width:none] md:px-4 [&::-webkit-scrollbar]:hidden">
            {sections.map((item) => {
              const isActive = item.id === activeId;
              return (
                <li key={item.id} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={isActive ? "true" : undefined}
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
