"use client";

import * as React from "react";
import { ArrowUpRightIcon, Loader2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { AppIcon } from "@ostiary/core/components/app-icon";
import { Button } from "@ostiary/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ostiary/core/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ostiary/core/components/ui/dialog";
import { Skeleton } from "@ostiary/core/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { disconnectMyApp, getMyConnectedApps } from "@/lib/connected-apps-actions";
import type { ConnectedApp } from "@/lib/connected-apps";

/** Scopes implied by signing in at all: not worth a line of their own. */
const IMPLIED_SCOPES = new Set(["openid"]);

/** Human permissions from the consent screen's wording; unknown (API) scopes stay as they are. */
function AppPermissions({ scopes }: { scopes: string[] }) {
  const t = useTranslations("dashboard.apps");
  const tConsent = useTranslations("consent.scopes");
  const shown = scopes.filter((scope) => !IMPLIED_SCOPES.has(scope));
  const known = shown.filter((scope) => tConsent.has(scope));
  const custom = shown.filter((scope) => !tConsent.has(scope));
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={t("permissions")}>
      {known.length === 0 && custom.length === 0 ? (
        <li className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t("signInOnly")}</li>
      ) : null}
      {known.map((scope) => (
        <li key={scope} className="rounded-md bg-muted px-2 py-0.5 text-xs text-foreground/80">
          {tConsent(scope)}
        </li>
      ))}
      {custom.map((scope) => (
        <li
          key={scope}
          className="max-w-full truncate rounded-md border border-border/80 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
          title={scope}
        >
          {scope}
        </li>
      ))}
    </ul>
  );
}

/** "Connected on 3 Mar 2026 · Last used 2 days ago", in the user's locale. */
function AppDates({ app }: { app: ConnectedApp }) {
  const t = useTranslations("dashboard.apps");
  const format = useFormatter();
  const now = React.useMemo(() => new Date(), []);
  const parts: string[] = [];
  if (app.connectedAt) {
    parts.push(t("connectedOn", { date: format.dateTime(new Date(app.connectedAt), { dateStyle: "medium" }) }));
  }
  if (app.lastUsedAt) {
    const last = new Date(app.lastUsedAt);
    parts.push(t("lastUsed", { time: format.relativeTime(last > now ? now : last, now) }));
  }
  if (parts.length === 0) return null;
  return (
    <p className="flex flex-wrap gap-x-1.5 text-xs text-muted-foreground">
      {parts.map((part, i) => (
        <span key={i} className="whitespace-nowrap">
          {i > 0 ? <span aria-hidden className="mr-1.5">·</span> : null}
          {part}
        </span>
      ))}
    </p>
  );
}

export function DashboardAppsSection() {
  const t = useTranslations("dashboard.apps");
  const { data: sessionWrap } = authClient.useSession();
  const userId = sessionWrap?.user?.id;

  const [rows, setRows] = React.useState<ConnectedApp[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [listError, setListError] = React.useState<string | null>(null);
  const [removingId, setRemovingId] = React.useState<string | null>(null);
  const [pendingRevoke, setPendingRevoke] = React.useState<ConnectedApp | null>(
    null,
  );

  const load = React.useCallback(async () => {
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setListError(null);
    try {
      const apps = await getMyConnectedApps();
      if (apps === null) {
        setListError(t("loadError"));
        setRows([]);
        return;
      }
      setRows(apps);
    } catch {
      setListError(t("loadError"));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [userId, t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function confirmRevoke() {
    const row = pendingRevoke;
    if (!row) return;
    setPendingRevoke(null);
    await revoke(row.clientId);
  }

  async function revoke(clientId: string) {
    setRemovingId(clientId);
    try {
      const { ok } = await disconnectMyApp(clientId).catch(() => ({ ok: false }));
      if (!ok) {
        toast.error(t("revokeError"));
        return;
      }
      toast.success(t("revoked"));
      void load();
    } finally {
      setRemovingId(null);
    }
  }

  function disconnectButton(row: ConnectedApp, extraClass: string) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={`relative z-10 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive ${extraClass}`}
        disabled={removingId === row.clientId}
        onClick={() => setPendingRevoke(row)}
        aria-label={t("disconnectApp", { app: row.name })}
    >
        {removingId === row.clientId ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : null}
        {t("disconnect")}
      </Button>
    );
  }

  return (
    <Card id="apps" className="scroll-mt-32 border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {listError ? (
          <p className="text-sm text-destructive" role="alert">
            {listError}
          </p>
        ) : null}
        {loading ? (
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-20 w-full" />
          </div>
        ) : listError ? null : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border/80">
            {rows.map((row) => (
              <li
                key={row.clientId}
                className={
                  "relative flex items-start gap-3 p-4 sm:gap-4" +
                  (row.site ? " transition-colors focus-within:bg-muted/40 hover:bg-muted/40" : "")
                }
              >
                <AppIcon
                  name={row.name}
                  src={row.hasIcon ? `/api/app-icon/${encodeURIComponent(row.clientId)}` : null}
                  className="mt-0.5"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="min-w-0">
                    {row.site ? (
                      // The whole row links to the app's site; the button below sits above the link.
                      <a
                        href={row.site.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group/link inline-flex max-w-full items-center gap-1 font-medium text-foreground outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
                      >
                        <span className="truncate">{row.name}</span>
                        <ArrowUpRightIcon
                          className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/link:opacity-100 group-focus-visible/link:opacity-100"
                          aria-hidden
                        />
                        <span className="sr-only">{t("opensInNewTab")}</span>
                      </a>
                    ) : (
                      <p className="truncate font-medium text-foreground">{row.name}</p>
                    )}
                    {row.site ? (
                      <p className="truncate text-xs text-muted-foreground">{row.site.host}</p>
                    ) : null}
                  </div>
                  <AppPermissions scopes={row.scopes} />
                  <AppDates app={row} />
                  <div className="sm:hidden">{disconnectButton(row, "-mb-1 -ml-2.5 h-7")}</div>
                </div>
                <div className="hidden sm:block">{disconnectButton(row, "-mr-2 -mt-1")}</div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog
        open={pendingRevoke !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRevoke(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("confirmRevokeTitle", { app: pendingRevoke?.name ?? "" })}
            </DialogTitle>
            <DialogDescription>{t("confirmRevokeBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingRevoke(null)}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmRevoke()}
            >
              {t("disconnect")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
