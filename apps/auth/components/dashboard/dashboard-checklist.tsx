"use client";

import * as React from "react";
import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@ostiary/core/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ostiary/core/components/ui/card";
import { Skeleton } from "@ostiary/core/components/ui/skeleton";
import { cn } from "@ostiary/core/lib/utils";

import { useDashboardSession } from "@/components/dashboard/dashboard-session";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { dashboardHref } from "@/lib/dashboard-tabs";

type Item = {
  id: string;
  done: boolean;
  label: string;
  /** What to do about it (or where to manage it once done). */
  action: string;
  href: string;
};

/** Passkeys and other sessions, read in the browser; null while loading. */
function useCounts() {
  const [counts, setCounts] = React.useState<{ passkeys: number; otherSessions: number } | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const failed = { data: null, error: true } as const;
      const [passkeys, sessions] = await Promise.all([
        authClient.passkey.listUserPasskeys().catch(() => failed),
        authClient.listSessions().catch(() => failed),
      ]);
      if (cancelled) return;
      const length = (r: { data: unknown; error: unknown }) => (!r.error && Array.isArray(r.data) ? r.data.length : 0);
      setCounts({ passkeys: length(passkeys), otherSessions: Math.max(0, length(sessions) - 1) });
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return counts;
}

/**
 * The overview's security checklist: email verified, two-factor authentication, a passkey, and
 * other signed-in devices. What is left to do comes first, each with a link to its tab.
 */
export function DashboardChecklist() {
  const t = useTranslations("dashboard.checklist");
  const { data } = useDashboardSession();
  const counts = useCounts();
  const { emailVerified, twoFactorEnabled } = data.user;

  const items: Item[] = [
    {
      id: "email",
      done: emailVerified,
      label: emailVerified ? t("emailVerified") : t("emailUnverified"),
      action: emailVerified ? t("manage") : t("verify"),
      href: dashboardHref("profile"),
    },
    {
      id: "two-factor",
      done: twoFactorEnabled,
      label: twoFactorEnabled ? t("twoFactorOn") : t("twoFactorOff"),
      action: twoFactorEnabled ? t("manage") : t("turnOn"),
      href: dashboardHref("security", "two-factor"),
    },
  ];
  if (counts) {
    items.push(
      {
        id: "passkeys",
        done: counts.passkeys > 0,
        label: counts.passkeys > 0 ? t("passkeys", { count: counts.passkeys }) : t("noPasskey"),
        action: counts.passkeys > 0 ? t("manage") : t("addPasskey"),
        href: dashboardHref("security", "passkeys"),
      },
      {
        id: "sessions",
        // Other devices are not a problem in themselves; they are worth a look.
        done: counts.otherSessions === 0,
        label: counts.otherSessions === 0 ? t("thisDeviceOnly") : t("otherSessions", { count: counts.otherSessions }),
        action: t("review"),
        href: dashboardHref("security", "sessions"),
      },
    );
  }
  const sorted = [...items].sort((a, b) => Number(a.done) - Number(b.done));
  const left = items.filter((item) => !item.done).length;

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{counts && left === 0 ? t("allDone") : t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border/70" aria-label={t("title")}>
          {sorted.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <span className="flex min-w-0 items-center gap-3 text-sm">
                {item.done ? (
                  <CircleCheckIcon className="size-5 shrink-0 text-emerald-600 dark:text-emerald-500" aria-hidden />
                ) : (
                  <CircleAlertIcon className="size-5 shrink-0 text-amber-600 dark:text-amber-500" aria-hidden />
                )}
                <span className={cn(!item.done && "font-medium")}>{item.label}</span>
              </span>
              <Button asChild size="sm" variant={item.done ? "ghost" : "outline"} className="shrink-0">
                <Link href={item.href}>{item.action}</Link>
              </Button>
            </li>
          ))}
          {counts === null ? (
            <li className="space-y-3 pt-3" aria-busy="true">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-6 w-1/2" />
            </li>
          ) : null}
        </ul>
      </CardContent>
    </Card>
  );
}
