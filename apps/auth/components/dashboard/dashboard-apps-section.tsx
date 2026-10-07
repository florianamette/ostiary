"use client";

import * as React from "react";
import { Loader2, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

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

/** The app's site, shown under its name; the client ID when it has none. */
function appSubtitle(app: ConnectedApp): string {
  if (!app.uri) return app.clientId;
  try {
    return new URL(app.uri).host;
  } catch {
    return app.uri;
  }
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
          <ul className="space-y-4">
            {rows.map((row) => (
              <li
                key={row.clientId}
                className="flex flex-col gap-3 rounded-lg border border-border/80 p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-foreground">{row.name}</p>
                  <p className="text-xs text-muted-foreground">{appSubtitle(row)}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {t("scopes")}
                    </span>
                    : {row.scopes.length ? row.scopes.join(", ") : t("none")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  disabled={removingId === row.clientId}
                  onClick={() => setPendingRevoke(row)}
                >
                  {removingId === row.clientId ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Trash2Icon className="size-3.5" aria-hidden />
                  )}
                  {t("revokeAccess")}
                </Button>
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
              {t("revokeAccess")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
