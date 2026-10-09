"use client";

import * as React from "react";
import { Loader2, Settings2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ostiary/core/components/ui/select";
import { Textarea } from "@ostiary/core/components/ui/textarea";
import type {
  ClientRegistrationSettings,
  DynamicRegistrationMode,
} from "@ostiary/core/lib/client-registration-policy";
import { updateClientRegistration } from "@/app/[locale]/(console)/applications/actions";

/** Display order of the modes; labels and hints are in `admin.pages.applications.registration.dynamic`. */
const DYNAMIC_MODES: DynamicRegistrationMode[] = ["off", "signed_in", "open"];

/** OIDC scopes are listed first; anything else is an API scope. */
const OIDC = new Set(["openid", "profile", "email", "offline_access"]);

/**
 * Settings for clients that register themselves (MCP clients, AI agents): Dynamic Client
 * Registration and Client ID Metadata Documents, both off by default, and what such clients
 * may get. Changes reach the auth server within a minute.
 */
export function ClientRegistrationCard({
  settings,
  availableScopes,
  authServer,
}: {
  settings: ClientRegistrationSettings;
  availableScopes: string[];
  authServer: string;
}) {
  const t = useTranslations("admin.pages.applications.registration");
  const tCommon = useTranslations("admin.common");
  const [open, setOpen] = React.useState(false);
  const enabled = settings.dynamic !== "off" || settings.metadataDocuments;
  const missing = settings.scopes.filter((scope) => !availableScopes.includes(scope));

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {t("title")}
          {enabled ? (
            <Badge variant="secondary">{tCommon("on")}</Badge>
          ) : (
            <Badge variant="outline" className="font-normal">
              {tCommon("off")}
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="max-w-3xl">
          {t("description")}
        </CardDescription>
        <CardAction>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Settings2Icon />
            {tCommon("edit")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <dt className="text-muted-foreground text-xs">{t("dynamicRegistration")}</dt>
            <dd className="font-medium">{t(`dynamic.${settings.dynamic}.label`)}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-muted-foreground text-xs">{t("metadataDocuments")}</dt>
            <dd className="font-medium">
              {settings.metadataDocuments
                ? settings.metadataDocumentHosts.length
                  ? t("metadataOnFrom", { hosts: settings.metadataDocumentHosts.join(", ") })
                  : t("metadataOnAnyHost")
                : tCommon("off")}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-muted-foreground text-xs">{t("scopes")}</dt>
            <dd className="flex flex-wrap gap-1">
              {settings.scopes.map((scope) => (
                <Badge
                  key={scope}
                  variant={missing.includes(scope) ? "destructive" : "secondary"}
                  className="font-mono font-normal"
                  title={missing.includes(scope) ? t("missingScope") : undefined}
                >
                  {scope}
                </Badge>
              ))}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-muted-foreground text-xs">{t("perHour")}</dt>
            <dd className="font-medium tabular-nums">{settings.maxRegistrationsPerHour}</dd>
          </div>
        </dl>
        {settings.dynamic !== "off" && authServer ? (
          <p className="text-muted-foreground mt-4 text-xs break-all">
            {t.rich("endpoint", {
              url: `${authServer}/api/auth/oauth2/register`,
              code: (chunks) => <code className="rounded bg-muted px-1 py-0.5 font-mono">{chunks}</code>,
            })}
          </p>
        ) : null}
      </CardContent>
      {open ? (
        <ClientRegistrationDialog
          settings={settings}
          availableScopes={availableScopes}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </Card>
  );
}

function ClientRegistrationDialog({
  settings,
  availableScopes,
  onClose,
}: {
  settings: ClientRegistrationSettings;
  availableScopes: string[];
  onClose: () => void;
}) {
  const t = useTranslations("admin.pages.applications.registration");
  const tCommon = useTranslations("admin.common");
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [dynamic, setDynamic] = React.useState<DynamicRegistrationMode>(settings.dynamic);
  const [metadataDocuments, setMetadataDocuments] = React.useState(settings.metadataDocuments);
  const [hosts, setHosts] = React.useState(settings.metadataDocumentHosts.join("\n"));
  const [scopes, setScopes] = React.useState<Set<string>>(
    () => new Set(settings.scopes.filter((scope) => availableScopes.includes(scope))),
  );
  const [max, setMax] = React.useState(String(settings.maxRegistrationsPerHour));
  const ordered = [
    ...availableScopes.filter((scope) => OIDC.has(scope)),
    ...availableScopes.filter((scope) => !OIDC.has(scope)),
  ];

  function toggleScope(scope: string, checked: boolean) {
    setScopes((current) => {
      const next = new Set(current);
      if (checked) next.add(scope);
      else next.delete(scope);
      return next;
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await updateClientRegistration({
        dynamic,
        metadataDocuments,
        scopes: ordered.filter((scope) => scopes.has(scope)),
        metadataDocumentHosts: hosts,
        maxRegistrationsPerHour: Number(max),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(t("saved"));
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={save} className="grid gap-6">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("dialogDescription")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="registration-dynamic">{t("dynamicLabel")}</FieldLabel>
              <Select value={dynamic} onValueChange={(v) => setDynamic(v as DynamicRegistrationMode)} disabled={busy}>
                <SelectTrigger id="registration-dynamic" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DYNAMIC_MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {t(`dynamic.${mode}.label`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>{t(`dynamic.${dynamic}.hint`)}</FieldDescription>
            </Field>
            <Field>
              <div className="flex gap-3 rounded-md border border-border/80 bg-muted/30 p-3">
                <input
                  id="registration-cimd"
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 rounded border-input"
                  checked={metadataDocuments}
                  disabled={busy}
                  onChange={(e) => setMetadataDocuments(e.target.checked)}
                />
                <div className="grid gap-1">
                  <Label htmlFor="registration-cimd" className="cursor-pointer font-medium leading-none">
                    {t("cimdLabel")}
                  </Label>
                  <p className="text-muted-foreground text-xs leading-snug">
                    {t("cimdHint")}
                  </p>
                </div>
              </div>
            </Field>
            {metadataDocuments ? (
              <Field>
                <FieldLabel htmlFor="registration-hosts">{t("hostsLabel")}</FieldLabel>
                <Textarea
                  id="registration-hosts"
                  value={hosts}
                  onChange={(e) => setHosts(e.target.value)}
                  disabled={busy}
                  rows={3}
                  placeholder={"claude.ai\nvscode.dev"}
                  className="font-mono text-sm"
                />
                <FieldDescription>{t("hostsHint")}</FieldDescription>
              </Field>
            ) : null}
            <Field>
              <FieldLabel>{t("scopesLabel")}</FieldLabel>
              <div className="grid gap-2 sm:grid-cols-2">
                {ordered.map((scope) => (
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
              <FieldDescription>
                {t("scopesHint")}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="registration-max">{t("perHour")}</FieldLabel>
              <Input
                id="registration-max"
                type="number"
                min={0}
                max={1000}
                step={1}
                inputMode="numeric"
                value={max}
                onChange={(e) => setMax(e.target.value)}
                disabled={busy}
                className="w-32"
              />
              <FieldDescription>
                {t("perHourHint")}
              </FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
