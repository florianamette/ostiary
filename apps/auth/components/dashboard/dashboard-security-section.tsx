"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { DashboardChangePasswordForm } from "@/components/dashboard/dashboard-change-password-form";
import { DashboardConnectedAccounts } from "@/components/dashboard/dashboard-connected-accounts";
import { DashboardPasskeysSection } from "@/components/dashboard/dashboard-passkeys-section";
import type { SocialProvider } from "@ostiary/core/lib/social-provider-meta";
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
import { authClient } from "@/lib/auth-client";

type SessionRow = {
  id: string;
  token: string;
  createdAt: Date;
  expiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function formatWhen(d: Date, label: string) {
  try {
    return `${label}: ${d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    })}`;
  } catch {
    return label;
  }
}

export function DashboardSecuritySection({
  socialProviders = [],
}: {
  /** Sign-in providers configured on the server; the section is hidden when empty. */
  socialProviders?: SocialProvider[];
}) {
  const t = useTranslations("dashboard.security");
  const { data: sessionData } = authClient.useSession();
  const currentToken = sessionData?.session?.token;

  const [sessions, setSessions] = React.useState<SessionRow[]>([]);
  const [loadingSessions, setLoadingSessions] = React.useState(true);
  const [revokeToken, setRevokeToken] = React.useState<string | null>(null);
  const [revokeOthersPending, setRevokeOthersPending] = React.useState(false);

  const loadSessions = React.useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await authClient.listSessions();
      if (res.error) {
        toast.error(res.error.message ?? t("sessionsLoadError"));
        setSessions([]);
        return;
      }
      const list = Array.isArray(res.data) ? res.data : [];
      setSessions(
        list.map((s) => ({
          id: s.id,
          token: s.token,
          createdAt: new Date(s.createdAt),
          expiresAt: new Date(s.expiresAt),
          ipAddress: s.ipAddress,
          userAgent: s.userAgent,
        })),
      );
    } finally {
      setLoadingSessions(false);
    }
  }, [t]);

  React.useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  async function revokeSession(token: string) {
    setRevokeToken(token);
    try {
      const { error } = await authClient.revokeSession({ token });
      if (error) {
        toast.error(error.message ?? t("revokeError"));
        return;
      }
      toast.success(t("sessionRevoked"));
      if (token === currentToken) {
        window.location.reload();
        return;
      }
      void loadSessions();
    } finally {
      setRevokeToken(null);
    }
  }

  async function handleRevokeOthers() {
    setRevokeOthersPending(true);
    try {
      const { error } = await authClient.revokeOtherSessions();
      if (error) {
        toast.error(error.message ?? t("revokeError"));
        return;
      }
      toast.success(t("othersRevoked"));
      void loadSessions();
    } finally {
      setRevokeOthersPending(false);
    }
  }

  return (
    <Card id="security" className="scroll-mt-32 border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <DashboardChangePasswordForm onPasswordChanged={() => void loadSessions()} />

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
              disabled={revokeOthersPending || sessions.length < 2}
              onClick={() => void handleRevokeOthers()}
            >
              {revokeOthersPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              {t("revokeOthers")}
            </Button>
          </div>

          {loadingSessions ? (
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
                    const isCurrent = s.token === currentToken;
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
                              {formatWhen(s.createdAt, t("started"))}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatWhen(s.expiresAt, t("expires"))}
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
                            disabled={revokeToken === s.token}
                            onClick={() => void revokeSession(s.token)}
                          >
                            {revokeToken === s.token ? (
                              <Loader2
                                className="size-4 animate-spin"
                                aria-hidden
                              />
                            ) : null}
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
