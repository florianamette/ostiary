"use client";

import * as React from "react";
import {
  KeyRoundIcon,
  MailCheckIcon,
  MailWarningIcon,
  MonitorSmartphoneIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Skeleton } from "@ostiary/core/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { cn } from "@ostiary/core/lib/utils";

type SummaryTileProps = {
  href: string;
  icon: LucideIcon;
  label: string;
  /** `null` while the value is still loading. */
  value: React.ReactNode | null;
  tone?: "default" | "positive" | "warning";
};

function SummaryTile({ href, icon: Icon, label, value, tone = "default" }: SummaryTileProps) {
  return (
    <a
      href={href}
      className="group flex flex-col gap-3 rounded-lg border border-border/80 bg-card p-4 shadow-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon
          aria-hidden
          className={cn(
            "size-4 shrink-0",
            tone === "positive" && "text-emerald-600 dark:text-emerald-500",
            tone === "warning" && "text-amber-600 dark:text-amber-500",
            tone === "default" && "text-muted-foreground",
          )}
        />
      </div>
      <div className="text-base font-semibold text-foreground">
        {value === null ? <Skeleton className="h-5 w-20" /> : value}
      </div>
    </a>
  );
}

/**
 * Four-line security status shown above the account sections, so the user sees
 * what needs attention before scrolling. Each tile links to its section.
 */
export function DashboardAccountSummary() {
  const t = useTranslations("dashboard");
  const { data: sessionData, isPending: sessionPending } =
    authClient.useSession();
  const [passkeyCount, setPasskeyCount] = React.useState<number | null>(null);
  const [sessionCount, setSessionCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [passkeys, sessions] = await Promise.all([
        authClient.passkey.listUserPasskeys(),
        authClient.listSessions(),
      ]);
      if (cancelled) return;
      setPasskeyCount(
        !passkeys.error && Array.isArray(passkeys.data)
          ? passkeys.data.length
          : 0,
      );
      setSessionCount(
        !sessions.error && Array.isArray(sessions.data)
          ? sessions.data.length
          : 0,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const emailVerified = sessionData?.user?.emailVerified;
  const emailValue = sessionPending
    ? null
    : emailVerified
      ? t("profile.verified")
      : t("profile.unverified");

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <SummaryTile
        href="#profile"
        icon={emailVerified ? MailCheckIcon : MailWarningIcon}
        label={t("profile.emailLabel")}
        value={emailValue}
        tone={sessionPending ? "default" : emailVerified ? "positive" : "warning"}
      />
      <SummaryTile
        href="#security"
        icon={KeyRoundIcon}
        label={t("passkeys.title")}
        value={passkeyCount === null ? null : String(passkeyCount)}
      />
      <SummaryTile
        href="#security"
        icon={MonitorSmartphoneIcon}
        label={t("security.sessionsTitle")}
        value={sessionCount === null ? null : String(sessionCount)}
      />
    </div>
  );
}
