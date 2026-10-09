"use client";

import * as React from "react";
import { CopyIcon, KeyRoundIcon, Loader2, PlusIcon, Trash2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@ostiary/core/components/ui/alert";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ostiary/core/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ostiary/core/components/ui/select";
import { Skeleton } from "@ostiary/core/components/ui/skeleton";
import type { MyApiKey } from "@/lib/api-key-serialize";
import {
  createMyApiKey,
  getMyApiKeys,
  revokeMyApiKey,
  type CreateApiKeyError,
  type MyApiKeys,
} from "@/lib/api-keys-actions";
import { signInAgain } from "@/lib/sign-in-again";

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
  const locale = useLocale();
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
          {data.keys.map((key) => {
            const expired = key.expiresAt !== null && new Date(key.expiresAt).getTime() <= now;
            return (
              <li
                key={key.id}
                className="flex flex-col gap-3 rounded-lg border border-border/80 p-4 sm:flex-row sm:items-start sm:justify-between"
              >
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
                  disabled={revokingId === key.id}
                  onClick={() => setPendingRevoke(key)}
                >
                  {revokingId === key.id ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Trash2Icon className="size-3.5" aria-hidden />
                  )}
                  {t("revoke")}
                </Button>
              </li>
            );
          })}
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

      <Dialog
        open={pendingRevoke !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRevoke(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("confirmRevokeTitle", { name: pendingRevoke?.name ?? "" })}</DialogTitle>
            <DialogDescription>{t("confirmRevokeBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingRevoke(null)}>
              {t("cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={() => void confirmRevoke()}>
              {t("revoke")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function CreateApiKeyDialog({
  data,
  create,
  limitText,
  onClose,
  onCreated,
}: {
  data: MyApiKeys;
  create: ApiKeysSource["create"];
  limitText: (max: number) => string;
  onClose: () => void;
  onCreated: (key: string, name: string) => void;
}) {
  const t = useTranslations("dashboard.apiKeys");
  const locale = useLocale();
  const [busy, setBusy] = React.useState(false);
  const [name, setName] = React.useState("");
  const [api, setApi] = React.useState(data.apis[0]?.identifier ?? "");
  const [scopes, setScopes] = React.useState<Set<string>>(new Set());
  const defaultDays = data.lifetimeChoices.includes(30) ? 30 : data.lifetimeChoices[0]!;
  const [days, setDays] = React.useState(String(defaultDays));
  const selected = data.apis.find((item) => item.identifier === api);

  function pickApi(identifier: string) {
    setApi(identifier);
    setScopes(new Set());
  }

  function toggleScope(scope: string, checked: boolean) {
    setScopes((current) => {
      const next = new Set(current);
      if (checked) next.add(scope);
      else next.delete(scope);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error(t("errors.name"));
      return;
    }
    if (scopes.size === 0) {
      toast.error(t("errors.scopes"));
      return;
    }
    setBusy(true);
    try {
      const result = await create({
        name,
        api,
        scopes: selected ? selected.scopes.filter((scope) => scopes.has(scope)) : [],
        expiresInDays: Number(days),
      }).catch(() => ({ ok: false as const, error: "failed" as const }));
      if (!result.ok) {
        if (result.error === "recentSignIn") {
          toast.error(t("errors.recentSignIn"), {
            action: { label: t("signInAgain"), onClick: () => void signInAgain(locale) },
          });
          return;
        }
        toast.error(result.error === "limit" ? limitText(data.maxKeys) : t(`errors.${result.error}`));
        return;
      }
      onCreated(result.key, result.created.name);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-6">
          <DialogHeader>
            <DialogTitle>{t("createTitle")}</DialogTitle>
            <DialogDescription>{t("createDescription")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="api-key-name">{t("name")}</FieldLabel>
              <Input
                id="api-key-name"
                value={name}
                maxLength={data.nameMaxLength}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
                disabled={busy}
                autoComplete="off"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="api-key-api">{t("api")}</FieldLabel>
              <Select value={api} onValueChange={pickApi} disabled={busy}>
                <SelectTrigger id="api-key-api" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {data.apis.map((item) => (
                    <SelectItem key={item.identifier} value={item.identifier}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selected ? <FieldDescription className="break-all font-mono text-xs">{selected.identifier}</FieldDescription> : null}
            </Field>
            {selected ? (
              <Field>
                <FieldLabel>{t("scopes")}</FieldLabel>
                <div className="grid gap-2 sm:grid-cols-2">
                  {selected.scopes.map((scope) => (
                    <label
                      key={scope}
                      className="flex min-w-0 items-center gap-2 rounded-md border border-border/80 px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="size-4 shrink-0 rounded border-input"
                        checked={scopes.has(scope)}
                        disabled={busy}
                        onChange={(e) => toggleScope(scope, e.target.checked)}
                      />
                      <span className="truncate font-mono text-xs">{scope}</span>
                    </label>
                  ))}
                </div>
                <FieldDescription>{t("scopesHint")}</FieldDescription>
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="api-key-expiry">{t("expiry")}</FieldLabel>
              <Select value={days} onValueChange={setDays} disabled={busy}>
                <SelectTrigger id="api-key-expiry" className="w-full sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {data.lifetimeChoices.map((choice) => (
                    <SelectItem key={choice} value={String(choice)}>
                      {t("days", { count: choice })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>{t("expiryHint", { max: data.maxLifetimeDays })}</FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={busy || !selected}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {t("createSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Shows a new key once. It is not stored: closing this dialog loses it. */
function IssuedKeyDialog({ issued, onClose }: { issued: { key: string; name: string } | null; onClose: () => void }) {
  const t = useTranslations("dashboard.apiKeys");

  async function copy() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.key);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyError"));
    }
  }

  return (
    <Dialog open={issued !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("issuedTitle", { name: issued?.name ?? "" })}</DialogTitle>
          <DialogDescription>{t("issuedDescription")}</DialogDescription>
        </DialogHeader>
        <Alert>
          <KeyRoundIcon aria-hidden />
          <AlertTitle>{t("issuedWarningTitle")}</AlertTitle>
          <AlertDescription>{t("issuedWarningBody")}</AlertDescription>
        </Alert>
        <div className="flex items-center gap-2">
          <code
            data-testid="issued-api-key"
            className="min-w-0 flex-1 break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs"
          >
            {issued?.key}
          </code>
          <Button type="button" variant="outline" size="icon" aria-label={t("copy")} onClick={() => void copy()}>
            <CopyIcon className="size-4" aria-hidden />
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            {t("done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
