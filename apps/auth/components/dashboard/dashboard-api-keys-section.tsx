"use client";

import * as React from "react";
import { KeyRoundIcon, Loader2, PlusIcon, Trash2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@ostiary/core/components/ui/badge";
import { Button } from "@ostiary/core/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ostiary/core/components/ui/card";
import { Skeleton } from "@ostiary/core/components/ui/skeleton";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { CreateApiKeyDialog, IssuedKeyDialog } from "@/components/dashboard/dashboard-api-key-dialogs";
import type { MyApiKey } from "@/lib/api-key-serialize";
import {
  createMyApiKey,
  getMyApiKeys,
  revokeMyApiKey,
  type CreateApiKeyError,
  type MyApiKeys,
} from "@/lib/api-keys-actions";

function formatDate(value: string | null, locale: string): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString(locale, { dateStyle: "medium" });
}

type NewKeyInput = { name: string; api: string; scopes: string[]; expiresInDays: number };

/** Where the keys come from: the user's own, or one organization's. */
export type ApiKeysSource = {
  load: () => Promise<MyApiKeys | null>;
  create: (
    input: NewKeyInput,
  ) => Promise<{ ok: true; key: string; created: MyApiKey } | { ok: false; error: CreateApiKeyError }>;
  revoke: (id: string) => Promise<{ ok: boolean }>;
};

const personalKeys: ApiKeysSource = { load: getMyApiKeys, create: createMyApiKey, revoke: revokeMyApiKey };

/**
 * API keys for the APIs registered in Ostiary: a script sends the key to the API, which
 * checks it with Ostiary. Each key is for one API and some of its scopes, and expires.
 */
export function DashboardApiKeysSection() {
  const t = useTranslations("dashboard.apiKeys");
  return (
    <ApiKeysManager
      source={personalKeys}
      layout="card"
      title={t("title")}
      description={t("description")}
      emptyText={t("empty")}
      loadErrorText={t("loadError")}
      limitText={(max) => t("errors.limit", { max })}
    />
  );
}

/**
 * The list of keys with create and revoke, as a dashboard card (personal keys) or inline
 * (an organization's keys, under the organization in the Organizations section).
 */
export function ApiKeysManager({
  source,
  layout,
  title,
  description,
  emptyText,
  loadErrorText,
  limitText,
  testId,
}: {
  source: ApiKeysSource;
  layout: "card" | "inline";
  title: string;
  description: string;
  emptyText: string;
  loadErrorText: string;
  limitText: (max: number) => string;
  testId?: string;
}) {
  const t = useTranslations("dashboard.apiKeys");
  const [data, setData] = React.useState<MyApiKeys | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [issued, setIssued] = React.useState<{ key: string; name: string } | null>(null);
  const [pendingRevoke, setPendingRevoke] = React.useState<MyApiKey | null>(null);
  const [revokingId, setRevokingId] = React.useState<string | null>(null);
  const { load: loadKeys, revoke: revokeKey } = source;

  const load = React.useCallback(async () => {
    setLoadError(false);
    try {
      const result = await loadKeys();
      if (!result) setLoadError(true);
      setData(result);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [loadKeys]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function confirmRevoke() {
    const row = pendingRevoke;
    if (!row) return;
    setPendingRevoke(null);
    setRevokingId(row.id);
    try {
      const { ok } = await revokeKey(row.id).catch(() => ({ ok: false }));
      if (!ok) {
        toast.error(t("revokeError"));
        return;
      }
      toast.success(t("revoked"));
      void load();
    } finally {
      setRevokingId(null);
    }
  }

  const canCreate = Boolean(data?.enabled && data.apis.length > 0);
  const now = Date.now();

  const createButton = data?.enabled ? (
    <Button type="button" size="sm" variant="outline" disabled={!canCreate} onClick={() => setCreating(true)}>
      <PlusIcon className="size-4" aria-hidden />
      {t("create")}
    </Button>
  ) : null;

  const content = (
    <>
      {loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadErrorText}
        </p>
      ) : null}
      {data && !data.enabled ? <p className="text-sm text-muted-foreground">{t("turnedOff")}</p> : null}
      {data?.enabled && data.apis.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noApis")}</p>
      ) : null}
      {loading ? (
        <Skeleton className="h-16 w-full" aria-busy="true" />
      ) : !data || loadError ? null : data.keys.length === 0 ? (
        data.enabled ? <p className="text-sm text-muted-foreground">{emptyText}</p> : null
      ) : (
        <ul className="space-y-3">
          {data.keys.map((key) => (
            <ApiKeyItem
              key={key.id}
              apiKey={key}
              now={now}
              revoking={revokingId === key.id}
              onRevoke={() => setPendingRevoke(key)}
            />
          ))}
        </ul>
      )}
    </>
  );

  const dialogs = (
    <>
      {creating && data ? (
        <CreateApiKeyDialog
          data={data}
          create={source.create}
          limitText={limitText}
          onClose={() => setCreating(false)}
          onCreated={(key, name) => {
            setCreating(false);
            setIssued({ key, name });
            void load();
          }}
        />
      ) : null}

      <IssuedKeyDialog issued={issued} onClose={() => setIssued(null)} />

      <ConfirmDialog
        open={pendingRevoke !== null}
        title={t("confirmRevokeTitle", { name: pendingRevoke?.name ?? "" })}
        description={t("confirmRevokeBody")}
        cancelLabel={t("cancel")}
        confirmLabel={t("revoke")}
        onCancel={() => setPendingRevoke(null)}
        onConfirm={() => void confirmRevoke()}
      />
    </>
  );

  if (layout === "inline") {
    return (
      <section className="space-y-4 rounded-lg border border-border/80 bg-muted/20 p-4" data-testid={testId}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h4 className="text-sm font-medium">{title}</h4>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          {createButton}
        </div>
        {content}
        {dialogs}
      </section>
    );
  }

  return (
    <Card id="api-keys" className="scroll-mt-32 border-border/80 shadow-sm" data-testid={testId}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {createButton ? <CardAction>{createButton}</CardAction> : null}
      </CardHeader>
      <CardContent className="space-y-4">{content}</CardContent>
      {dialogs}
    </Card>
  );
}

function ApiKeyItem({
  apiKey: key,
  now,
  revoking,
  onRevoke,
}: {
  apiKey: MyApiKey;
  now: number;
  revoking: boolean;
  onRevoke: () => void;
}) {
  const t = useTranslations("dashboard.apiKeys");
  const locale = useLocale();
  const expired = key.expiresAt !== null && new Date(key.expiresAt).getTime() <= now;
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border/80 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
          <KeyRoundIcon className="size-4 text-muted-foreground" aria-hidden />
          <span className="break-all">{key.name}</span>
          {key.start ? (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              {key.start}…
            </code>
          ) : null}
          {expired ? <Badge variant="destructive">{t("expired")}</Badge> : null}
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{t("api")}</span>:{" "}
          {key.apiName ?? key.api ?? t("unknownApi")}
        </p>
        <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{t("scopes")}:</span>
          {key.scopes.map((scope) => (
            <Badge key={scope} variant="secondary" className="font-mono font-normal">
              {scope}
            </Badge>
          ))}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("createdOn", { date: formatDate(key.createdAt, locale) ?? "" })}
          {key.createdBy !== undefined ? (
            <>
              {" · "}
              {key.createdBy ? t("createdBy", { name: key.createdBy }) : t("createdByDeleted")}
            </>
          ) : null}
          {" · "}
          {key.lastUsedAt
            ? t("lastUsedOn", { date: formatDate(key.lastUsedAt, locale) ?? "" })
            : t("neverUsed")}
          {key.expiresAt ? (
            <>
              {" · "}
              {t("expiresOn", { date: formatDate(key.expiresAt, locale) ?? "" })}
            </>
          ) : null}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 gap-1.5"
        disabled={revoking}
        onClick={onRevoke}
      >
        {revoking ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Trash2Icon className="size-3.5" aria-hidden />
        )}
        {t("revoke")}
      </Button>
    </li>
  );
}
