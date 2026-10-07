"use client";

import * as React from "react";
import { ChevronDownIcon, LogOutIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Logo } from "@ostiary/core/components/brand/logo";
import { PreferencesMenuItems } from "@ostiary/core/components/layout/preferences-menu-items";
import { Avatar, AvatarFallback } from "@ostiary/core/components/ui/avatar";
import { Button } from "@ostiary/core/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ostiary/core/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { cn } from "@ostiary/core/lib/utils";

const SECTION_IDS = ["overview", "profile", "organizations", "security", "apps"];

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
  impersonation,
}: {
  children: React.ReactNode;
  user: { name: string; email: string };
  isAdmin: boolean;
  /** False when the user is only in the default Public workspace. */
  showOrganizations: boolean;
  /** Set while an admin is viewing this account through impersonation. */
  impersonation: { userId: string; adminAppUrl: string | null } | null;
}) {
  const t = useTranslations("dashboard");
  const locale = useLocale();

  const sectionIds = React.useMemo(
    () => SECTION_IDS.filter((id) => showOrganizations || id !== "organizations"),
    [showOrganizations],
  );
  const activeId = useActiveSection(sectionIds);

  const displayName = user.name || user.email;
  const initial = displayName.trim().charAt(0).toUpperCase();

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
  ].filter((item) => sectionIds.includes(item.id));

  function handleSignOut() {
    void authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = `/${locale}/login`;
        },
      },
    });
  }

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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-9 min-w-0 gap-2 px-1.5"
                aria-label={t("accountMenu")}
              >
                <Avatar className="size-7">
                  <AvatarFallback className="text-xs font-medium">
                    {initial}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden max-w-40 truncate text-sm sm:inline">
                  {displayName}
                </span>
                <ChevronDownIcon
                  className="size-4 text-muted-foreground"
                  aria-hidden
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="flex min-w-0 flex-col gap-0.5 font-normal">
                <span className="truncate text-sm font-medium text-foreground">
                  {displayName}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {user.email}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {isAdmin ? (
                <DropdownMenuItem asChild>
                  <a href={process.env.NEXT_PUBLIC_ADMIN_APP_URL ?? "/"}>{t("nav.admin")}</a>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem asChild>
                <Link href="/">{t("nav.marketingHome")}</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <PreferencesMenuItems />
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleSignOut}>
                <LogOutIcon className="size-4" aria-hidden />
                {t("nav.signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
