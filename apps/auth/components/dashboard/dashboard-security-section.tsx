"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { DashboardChangePasswordForm } from "@/components/dashboard/dashboard-change-password-form";
import { DashboardConnectedAccounts } from "@/components/dashboard/dashboard-connected-accounts";
import { DashboardPasskeysSection } from "@/components/dashboard/dashboard-passkeys-section";
import { DashboardTwoFactorSection } from "@/components/dashboard/dashboard-two-factor-section";
import type { SocialProviderOption } from "@ostiary/core/lib/social-provider-meta";
import { getHtmlLang } from "@ostiary/core/i18n/locale-html";
import type { AppLocale } from "@ostiary/core/i18n/routing";
import { Button } from "@ostiary/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ostiary/core/components/ui/card";
import { FieldDescription } from "@ostiary/core/components/ui/field";
import { Separator } from "@ostiary/core/components/ui/separator";
import { Skeleton } from "@ostiary/core/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ostiary/core/components/ui/table";
import { useAsyncResource } from "@ostiary/core/hooks/use-async-resource";
import { useDashboardSession } from "@/components/dashboard/dashboard-session";
import { authClient } from "@/lib/auth-client";
import { useAuthAction } from "@/lib/use-auth-action";

type SessionRow = {
  id: string;
  token: string;
  createdAt: Date;
  expiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function formatWhen(d: Date, locale: string): string | null {
  try {
    return d.toLocaleString(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return null;
  }
}

async function listSessions(): Promise<SessionRow[]> {
  const res = await authClient.listSessions();
  if (res.error) throw res.error;
  return (Array.isArray(res.data) ? res.data : []).map((s) => ({
    id: s.id,
    token: s.token,
    createdAt: new Date(s.createdAt),
    expiresAt: new Date(s.expiresAt),
    ipAddress: s.ipAddress,
    userAgent: s.userAgent,
  }));
}

export function DashboardSecuritySection({
  socialProviders = [],
  adminConsoleUrl,
}: {
  /** Sign-in providers configured on the server; the section is hidden when empty. */
  socialProviders?: SocialProviderOption[];
  /** Set when this admin must turn on 2FA before using the admin console. */
  adminConsoleUrl?: string;
}) {
  const t = useTranslations("dashboard.security");
  const locale = useLocale();
  const when = (d: Date, key: "started" | "expires") => {
    const date = formatWhen(d, getHtmlLang(locale as AppLocale));
    return date ? t(`${key}At`, { date }) : t(key);
  };
  const { data: current } = useDashboardSession();
  const currentSessionId = current.session.id;
  const sessionsResource = useAsyncResource(listSessions);
  const sessions = sessionsResource.data ?? [];
  const { pending, run } = useAuthAction<`revoke:${string}` | "others">();

  React.useEffect(() => {
    if (sessionsResource.error) toast.error(t("sessionsLoadError"));
  }, [sessionsResource.error, t]);

  function revokeSession(row: SessionRow) {
    return run(`revoke:${row.id}`, {
      call: () => authClient.revokeSession({ token: row.token }),
      success: t("sessionRevoked"),
      error: t("revokeError"),
      onSuccess: () => {
        if (row.id === currentSessionId) {
          window.location.reload();
          return;
        }
        return sessionsResource.reload();
      },
    });
  }

  function handleRevokeOthers() {
    return run("others", {
      call: () => authClient.revokeOtherSessions(),
      success: t("othersRevoked"),
      error: t("revokeError"),
      onSuccess: sessionsResource.reload,
    });
  }

  return (
    <Card id="security" className="scroll-mt-32 border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <DashboardChangePasswordForm onPasswordChanged={() => void sessionsResource.reload()} />

        <Separator />

        <DashboardTwoFactorSection adminConsoleUrl={adminConsoleUrl} />

        <Separator />

        <DashboardPasskeysSection />

        <Separator />

        {socialProviders.length ? (
          <>
            <DashboardConnectedAccounts providers={socialProviders} />
            <Separator />
          </>
        ) : null}

        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-medium">{t("sessionsTitle")}</h3>
              <FieldDescription>{t("sessionsHint")}</FieldDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={pending === "others"}
              disabled={sessions.length < 2}
              onClick={() => void handleRevokeOthers()}
            >
              {t("revokeOthers")}
            </Button>
          </div>

          {sessionsResource.loading ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noSessions")}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("device")}</TableHead>
                    <TableHead className="hidden md:table-cell">
                      {t("network")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("actions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s) => {
                    const isCurrent = s.id === currentSessionId;
                    const ua = s.userAgent?.trim();
                    const deviceLabel = isCurrent
                      ? t("currentSession")
                      : ua
                        ? ua.slice(0, 72) + (ua.length > 72 ? "…" : "")
                        : t("unknownDevice");
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="max-w-[min(100%,18rem)] align-top text-sm">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">{deviceLabel}</span>
                            <span className="text-xs text-muted-foreground">
                              {when(s.createdAt, "started")}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {when(s.expiresAt, "expires")}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden align-top text-sm text-muted-foreground md:table-cell">
                          {s.ipAddress ?? t("none")}
                        </TableCell>
                        <TableCell className="text-right align-top">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            loading={pending === `revoke:${s.id}`}
                            onClick={() => void revokeSession(s)}
                          >
                            {t("revoke")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
