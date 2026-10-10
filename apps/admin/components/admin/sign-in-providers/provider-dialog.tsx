"use client";

import * as React from "react";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { SocialProviderIcon } from "@ostiary/core/components/brand/social-provider-icon";
import { Badge } from "@ostiary/core/components/ui/badge";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ostiary/core/components/ui/select";
import { Textarea } from "@ostiary/core/components/ui/textarea";
import {
  SOCIAL_PROVIDER_META,
  socialCallbackUrl,
  type ProviderField,
} from "@ostiary/core/lib/social-provider-meta";
import { removeProvider, saveProvider } from "@/app/[locale]/(console)/sign-in-providers/actions";
import { CheckboxField } from "@/components/admin/common/choice-field";
import { useAdminAction } from "@/components/admin/common/use-admin-action";
import type { SignInProviderRow } from "@/components/admin/sign-in-providers/admin-sign-in-providers-panel";

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

export function StatusBadge({ row }: { row: SignInProviderRow }) {
  const t = useTranslations("admin.pages.signInProviders.panel");
  const tc = useTranslations("admin.common");
  if (row.source === "environment") return <Badge variant="secondary">{t("environment")}</Badge>;
  if (row.enabled) return <Badge>{tc("on")}</Badge>;
  if (row.source === "database") return <Badge variant="outline" className="font-normal">{tc("off")}</Badge>;
  return null;
}

export function ProviderDialog({
  row,
  authAppUrl,
  onClose,
}: {
  row: SignInProviderRow | null;
  authAppUrl: string;
  onClose: () => void;
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
  const { busy: saving, run } = useAdminAction(onClose);
  const [confirmRemove, setConfirmRemove] = React.useState(false);

  if (!row || !meta) return <Dialog open={false} />;
  const providerId = row.id;
  const name = meta.name;
  const callbackUrl = socialCallbackUrl(authAppUrl, providerId);
  const fieldId = (key: string) => `provider-${providerId}-${key}`;

  function save(e: React.FormEvent) {
    e.preventDefault();
    void run(
      () => saveProvider(providerId, { enabled, allowSignUp, oneTap, config, secrets }),
      enabled ? t("savedOn", { name }) : t("saved", { name }),
    );
  }

  function remove() {
    void run(() => removeProvider(providerId), t("removed", { name }));
  }

  function renderField(field: ProviderField) {
    const id = fieldId(field.key);
    const label = (
      <FieldLabel htmlFor={id}>
        {providerText(`${providerId}.fields.${field.key}.label`, field.label)}
        {field.optional ? <span className="font-normal text-muted-foreground">{t("optional")}</span> : null}
      </FieldLabel>
    );
    const hint = field.hint ? (
      <FieldDescription>{providerText(`${providerId}.fields.${field.key}.hint`, field.hint)}</FieldDescription>
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
                <Button type="button" variant="destructive" disabled={saving} onClick={remove}>
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
