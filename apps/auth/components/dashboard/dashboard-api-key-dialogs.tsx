"use client";

import * as React from "react";
import { CopyIcon, KeyRoundIcon, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@ostiary/core/components/ui/alert";
import { Button } from "@ostiary/core/components/ui/button";
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
import type { ApiKeysSource } from "@/components/dashboard/dashboard-api-keys-section";
import type { MyApiKeys } from "@/lib/api-keys-actions";
import { signInAgain } from "@/lib/sign-in-again";

export function CreateApiKeyDialog({
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
export function IssuedKeyDialog({ issued, onClose }: { issued: { key: string; name: string } | null; onClose: () => void }) {
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
