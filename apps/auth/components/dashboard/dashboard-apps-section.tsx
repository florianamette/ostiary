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

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function normalizeGetConsentsPayload(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const o = asRecord(data);
  if (o && Array.isArray(o.consents)) return o.consents;
  return [];
}

function normalizeGetClientsPayload(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const o = asRecord(data);
  if (o && Array.isArray(o.clients)) return o.clients;
  return [];
}

function buildClientNameMap(clientsPayload: unknown): Map<string, string> {
  const map = new Map<string, string>();
  for (const raw of normalizeGetClientsPayload(clientsPayload)) {
    const o = asRecord(raw);
    if (!o) continue;
    const id = String(o.client_id ?? o.clientId ?? "");
    if (!id) continue;
    const name = String(o.client_name ?? o.clientName ?? o.name ?? id);
    map.set(id, name);
  }
  return map;
}

type AppRow = {
  id: string;
  clientId: string;
  clientLabel: string;
  scopes: string[];
};

export function DashboardAppsSection() {
  const t = useTranslations("dashboard.apps");
  const { data: sessionWrap } = authClient.useSession();
  const userId = sessionWrap?.user?.id;

  const [rows, setRows] = React.useState<AppRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [listError, setListError] = React.useState<string | null>(null);
  const [removingId, setRemovingId] = React.useState<string | null>(null);
  const [pendingRevoke, setPendingRevoke] = React.useState<AppRow | null>(
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
      const [consentsRes, clientsRes] = await Promise.all([
        authClient.oauth2.getConsents(),
        authClient.oauth2.getClients(),
      ]);
      if (consentsRes.error) {
        setListError(consentsRes.error.message ?? t("loadError"));
        setRows([]);
        return;
      }
      if (clientsRes.error) {
        setListError(clientsRes.error.message ?? t("loadError"));
        setRows([]);
        return;
      }
      const clientNames = buildClientNameMap(clientsRes.data);
      const list: AppRow[] = [];
      for (const raw of normalizeGetConsentsPayload(consentsRes.data)) {
        const o = asRecord(raw);
        if (!o) continue;
        const id = String(o.id ?? "");
        const rowUserId = String(o.userId ?? o.user_id ?? "");
        if (!id || rowUserId !== userId) continue;
        const clientId = String(o.clientId ?? o.client_id ?? "");
        if (!clientId) continue;
        list.push({
          id,
          clientId,
          clientLabel: clientNames.get(clientId) ?? clientId,
          scopes: asStringArray(o.scopes),
        });
      }
      setRows(list);
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
    await revoke(row.id);
  }

  async function revoke(id: string) {
    setRemovingId(id);
    try {
      const { error } = await authClient.oauth2.deleteConsent({ id });
      if (error) {
        toast.error(error.message ?? t("revokeError"));
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
                key={row.id}
                className="flex flex-col gap-3 rounded-lg border border-border/80 p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-foreground">{row.clientLabel}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {row.clientId}
                  </p>
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
                  disabled={removingId === row.id}
                  onClick={() => setPendingRevoke(row)}
                >
                  {removingId === row.id ? (
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
              {t("confirmRevokeTitle", { app: pendingRevoke?.clientLabel ?? "" })}
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
