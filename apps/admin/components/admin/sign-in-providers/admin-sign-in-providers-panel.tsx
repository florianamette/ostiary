"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Check, Copy, ExternalLink, Loader2, Search, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { SocialProviderIcon } from "@ostiary/core/components/brand/social-provider-icon";
import { Badge } from "@ostiary/core/components/ui/badge";
import { Button } from "@ostiary/core/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ostiary/core/components/ui/card";
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
import { Label } from "@ostiary/core/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ostiary/core/components/ui/select";
import { Textarea } from "@ostiary/core/components/ui/textarea";
import {
  SOCIAL_PROVIDER_META,
  socialCallbackUrl,
  type ProviderField,
  type SocialProvider,
} from "@ostiary/core/lib/social-provider-meta";
import { removeProvider, reorderProviders, saveProvider } from "@/app/[locale]/(console)/sign-in-providers/actions";

export type SignInProviderRow = {
  id: SocialProvider;
  source: "environment" | "database" | null;
  enabled: boolean;
  position: number;
  allowSignUp: boolean;
  /** Google only: Google One Tap on the sign-in and sign-up pages. */
  oneTap: boolean;
  config: Record<string, string>;
  secretsSet: string[];
  secretsUnreadable: boolean;
  missing: string[];
  updatedAt: string | null;
  linkedAccounts: number;
};

type Result = { ok: true } | { ok: false; error: string };

function CheckboxField({
  id,
  checked,
  onChange,
  disabled,
  label,
  hint,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex gap-3 rounded-md border border-border/80 bg-muted/30 p-3">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 rounded border-input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="grid gap-1">
        <Label htmlFor={id} className="cursor-pointer font-medium leading-none">
          {label}
        </Label>
        <p className="text-muted-foreground text-xs leading-snug">{hint}</p>
      </div>
    </div>
  );
}

function CopyField({ id, value }: { id: string; value: string }) {
  const t = useTranslations("admin.pages.signInProviders.panel");
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="flex gap-2">
      <Input id={id} readOnly value={value} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={t("copyCallback")}
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

/** The auth app's origin, as Google's "Authorized JavaScript origins" wants it (null if unknown). */
function authAppOrigin(authAppUrl: string): string | null {
  try {
    return new URL(authAppUrl).origin;
  } catch {
    return null;
  }
}

/**
 * A provider's text from SOCIAL_PROVIDER_META (field labels and hints, notes), translated
 * under admin.pages.signInProviders.providers, else the English from the meta.
 */
function useProviderText() {
  const t = useTranslations("admin.pages.signInProviders.providers");
  return React.useCallback(
    (key: string, fallback: string) => (t.has(key) ? t(key) : fallback),
    [t],
  );
}

function StatusBadge({ row }: { row: SignInProviderRow }) {
  const t = useTranslations("admin.pages.signInProviders.panel");
  const tc = useTranslations("admin.common");
  if (row.source === "environment") return <Badge variant="secondary">{t("environment")}</Badge>;
  if (row.enabled) return <Badge>{tc("on")}</Badge>;
  if (row.source === "database") return <Badge variant="outline" className="font-normal">{tc("off")}</Badge>;
  return null;
}

/** Social sign-in providers: which ones the sign-in page offers, in which order, with which credentials. */
export function AdminSignInProvidersPanel({
  providers,
  authAppUrl,
}: {
  providers: SignInProviderRow[];
  authAppUrl: string;
}) {
  const t = useTranslations("admin.pages.signInProviders.panel");
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<SocialProvider | null>(null);
  const [busy, setBusy] = React.useState(false);

  const active = providers
    .filter((p) => p.enabled)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const needle = query.trim().toLowerCase();
  const listed = providers.filter(
    (p) => !needle || p.id.includes(needle) || SOCIAL_PROVIDER_META[p.id].name.toLowerCase().includes(needle),
  );
  const current = editing ? providers.find((p) => p.id === editing) ?? null : null;

  async function run(action: () => Promise<Result>, success?: string) {
    setBusy(true);
    try {
      const res = await action();
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      if (success) toast.success(success);
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  function move(index: number, delta: number) {
    const ids = active.map((p) => p.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved!);
    void run(() => reorderProviders(ids));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[2fr_3fr]">
      <Card className="h-fit border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>{t("activeTitle")}</CardTitle>
          <CardDescription>{t("activeDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {active.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              {t("noneActive")}
            </p>
          ) : (
            <ol className="divide-y divide-border rounded-md border border-border">
              {active.map((row, index) => (
                <li key={row.id} className="flex items-center gap-3 px-3 py-2">
                  <SocialProviderIcon provider={row.id} name={SOCIAL_PROVIDER_META[row.id].name} className="size-5" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {row.config.buttonName || SOCIAL_PROVIDER_META[row.id].name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.source === "environment" ? t("setByEnvironment") : null}
                      {row.source !== "environment" && !row.allowSignUp ? t("existingAccountsOnly") : null}
                      {row.source !== "environment" && row.allowSignUp ? t("connectedAccounts", { count: row.linkedAccounts }) : null}
                      {row.oneTap ? " · One Tap" : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={busy || index === 0}
                      aria-label={t("moveUp", { name: SOCIAL_PROVIDER_META[row.id].name })}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={busy || index === active.length - 1}
                      aria-label={t("moveDown", { name: SOCIAL_PROVIDER_META[row.id].name })}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={t("edit", { name: SOCIAL_PROVIDER_META[row.id].name })}
                      onClick={() => setEditing(row.id)}
                    >
                      <Settings2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>{t("providersTitle")}</CardTitle>
          <CardDescription>{t("providersDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search")}
              aria-label={t("search")}
              className="pl-8"
            />
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
            {listed.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setEditing(row.id)}
                  className="flex w-full items-center gap-3 rounded-md border border-border/80 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <SocialProviderIcon provider={row.id} name={SOCIAL_PROVIDER_META[row.id].name} className="size-5" />
                  <span className="min-w-0 flex-1 truncate font-medium">{SOCIAL_PROVIDER_META[row.id].name}</span>
                  <StatusBadge row={row} />
                </button>
              </li>
            ))}
          </ul>
          {listed.length === 0 ? <p className="text-sm text-muted-foreground">{t("noMatch")}</p> : null}
        </CardContent>
      </Card>

      <ProviderDialog
        key={current?.id ?? "none"}
        row={current}
        authAppUrl={authAppUrl}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function ProviderDialog({
  row,
  authAppUrl,
  onClose,
  onSaved,
}: {
  row: SignInProviderRow | null;
  authAppUrl: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("admin.pages.signInProviders.panel");
  const tc = useTranslations("admin.common");
  const providerText = useProviderText();
  const meta = row ? SOCIAL_PROVIDER_META[row.id] : null;
  const readOnly = row?.source === "environment";
  const [config, setConfig] = React.useState<Record<string, string>>(row?.config ?? {});
  // Secret fields being replaced (or cleared, with null). Untouched ones keep their value.
  const [secrets, setSecrets] = React.useState<Record<string, string | null>>({});
  const [enabled, setEnabled] = React.useState(row ? row.enabled || row.source === null : false);
  const [allowSignUp, setAllowSignUp] = React.useState(row?.allowSignUp ?? true);
  const [oneTap, setOneTap] = React.useState(row?.oneTap ?? false);
  const [saving, setSaving] = React.useState(false);
  const [confirmRemove, setConfirmRemove] = React.useState(false);

  if (!row || !meta) return <Dialog open={false} />;
  const callbackUrl = socialCallbackUrl(authAppUrl, row.id);
  const fieldId = (key: string) => `provider-${row.id}-${key}`;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!row) return;
    setSaving(true);
    try {
      const res = await saveProvider(row.id, { enabled, allowSignUp, oneTap, config, secrets });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(enabled ? t("savedOn", { name: meta!.name }) : t("saved", { name: meta!.name }));
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!row) return;
    setSaving(true);
    try {
      const res = await removeProvider(row.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(t("removed", { name: meta!.name }));
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  function renderField(field: ProviderField) {
    const id = fieldId(field.key);
    const label = (
      <FieldLabel htmlFor={id}>
        {providerText(`${row!.id}.fields.${field.key}.label`, field.label)}
        {field.optional ? <span className="font-normal text-muted-foreground">{t("optional")}</span> : null}
      </FieldLabel>
    );
    const hint = field.hint ? (
      <FieldDescription>{providerText(`${row!.id}.fields.${field.key}.hint`, field.hint)}</FieldDescription>
    ) : null;
    if (field.secret) {
      const isSet = row!.secretsSet.includes(field.key);
      const replacing = field.key in secrets;
      if (readOnly || (isSet && !replacing)) {
        return (
          <Field key={field.key}>
            {label}
            <div className="flex flex-wrap items-center gap-2">
              <span id={id} className="rounded-md border border-border/80 bg-muted/40 px-3 py-1.5 font-mono text-sm tracking-widest">
                ••••••••
              </span>
              <span className="text-xs text-muted-foreground">{t("secretSet")}</span>
              {readOnly ? null : (
                <>
                  <Button type="button" variant="outline" size="sm" onClick={() => setSecrets((s) => ({ ...s, [field.key]: "" }))}>
                    {t("replace")}
                  </Button>
                  {field.optional ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSecrets((s) => ({ ...s, [field.key]: null }))}>
                      {tc("remove")}
                    </Button>
                  ) : null}
                </>
              )}
            </div>
            {hint}
          </Field>
        );
      }
      const value = secrets[field.key] ?? "";
      const onChange = (next: string) => setSecrets((s) => ({ ...s, [field.key]: next }));
      return (
        <Field key={field.key}>
          {label}
          {secrets[field.key] === null ? (
            <p className="text-sm text-muted-foreground">
              {t("removedOnSave")}{" "}
              <button type="button" className="underline underline-offset-4" onClick={() =>
                  setSecrets((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== field.key)))
                }>
                {t("undo")}
              </button>
            </p>
          ) : field.multiline ? (
            <Textarea
              id={id}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.placeholder}
              rows={5}
              spellCheck={false}
              autoComplete="off"
              className="font-mono text-xs"
            />
          ) : (
            <Input
              id={id}
              type="password"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={isSet ? t("newValue") : field.placeholder}
              autoComplete="new-password"
              spellCheck={false}
            />
          )}
          {hint}
        </Field>
      );
    }
    if (field.options) {
      return (
        <Field key={field.key}>
          {label}
          <Select
            value={config[field.key] || field.options[0]}
            onValueChange={(v) => setConfig((c) => ({ ...c, [field.key]: v }))}
            disabled={readOnly}
          >
            <SelectTrigger id={id} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {field.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hint}
        </Field>
      );
    }
    return (
      <Field key={field.key}>
        {label}
        <Input
          id={id}
          value={config[field.key] ?? ""}
          onChange={(e) => setConfig((c) => ({ ...c, [field.key]: e.target.value }))}
          placeholder={field.placeholder}
          readOnly={readOnly}
          spellCheck={false}
          autoComplete="off"
        />
        {hint}
      </Field>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SocialProviderIcon provider={row.id} name={meta.name} className="size-5" />
            {meta.name}
            <StatusBadge row={row} />
          </DialogTitle>
          <DialogDescription>
            {readOnly
              ? t("environmentDescription", { clientIdVar: "GITHUB_CLIENT_ID", clientSecretVar: "GITHUB_CLIENT_SECRET" })
              : meta.note
                ? providerText(`${row.id}.note`, meta.note)
                : t("defaultNote", { name: meta.name })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={fieldId("callback")}>{t("callbackUrl")}</FieldLabel>
              <CopyField id={fieldId("callback")} value={callbackUrl} />
              <FieldDescription>
                {t("callbackHint")}{" "}
                <a href={meta.consoleUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">
                  {t("createApp")} <ExternalLink className="size-3" aria-hidden />
                </a>
                {" · "}
                <a href={meta.docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">
                  {t("setupGuide")} <ExternalLink className="size-3" aria-hidden />
                </a>
              </FieldDescription>
            </Field>
            {row.secretsUnreadable ? (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {t("secretsUnreadable", { envVar: "BETTER_AUTH_SECRET" })}
              </p>
            ) : null}
            {meta.fields.map(renderField)}
            {readOnly ? null : (
              <>
                <Field>
                  <FieldLabel htmlFor={fieldId("buttonName")}>
                    {t("buttonName")} <span className="font-normal text-muted-foreground">{t("optional")}</span>
                  </FieldLabel>
                  <Input
                    id={fieldId("buttonName")}
                    value={config.buttonName ?? ""}
                    onChange={(e) => setConfig((c) => ({ ...c, buttonName: e.target.value }))}
                    placeholder={meta.name}
                    maxLength={40}
                  />
                  <FieldDescription>{t("buttonNameHint")}</FieldDescription>
                </Field>
                <Field>
                  <CheckboxField
                    id={fieldId("allowSignUp")}
                    checked={allowSignUp}
                    onChange={setAllowSignUp}
                    disabled={saving}
                    label={t("allowSignUp")}
                    hint={t("allowSignUpHint")}
                  />
                </Field>
                {row.id === "google" ? (
                  <Field>
                    <CheckboxField
                      id={fieldId("oneTap")}
                      checked={oneTap}
                      onChange={setOneTap}
                      disabled={saving}
                      label={t("oneTap")}
                      hint={t("oneTapHint", { origin: authAppOrigin(authAppUrl) ?? t("authAppFallback") })}
                    />
                  </Field>
                ) : null}
                <Field>
                  <CheckboxField
                    id={fieldId("enabled")}
                    checked={enabled}
                    onChange={setEnabled}
                    disabled={saving}
                    label={t("enabled")}
                    hint={t("enabledHint")}
                  />
                </Field>
              </>
            )}
          </FieldGroup>
          <DialogFooter className="mt-6 gap-2 sm:justify-between">
            {row.source === "database" && !readOnly ? (
              confirmRemove ? (
                <Button type="button" variant="destructive" disabled={saving} onClick={() => void remove()}>
                  {t("removeConfirm")}
                </Button>
              ) : (
                <Button type="button" variant="ghost" className="text-destructive" disabled={saving} onClick={() => setConfirmRemove(true)}>
                  {t("removeSettings")}
                </Button>
              )
            ) : (
              <span />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
                {readOnly ? tc("close") : tc("cancel")}
              </Button>
              {readOnly ? null : (
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
                  {tc("save")}
                </Button>
              )}
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
