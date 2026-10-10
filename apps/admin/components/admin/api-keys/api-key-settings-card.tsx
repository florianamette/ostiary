"use client";

import * as React from "react";
import { Settings2Icon } from "lucide-react";
import { useTranslations } from "next-intl";

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
  DialogHeader,
  DialogTitle,
} from "@ostiary/core/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { updateApiKeySettings } from "@/app/[locale]/(console)/api-keys/actions";
import { CheckboxField } from "@/components/admin/common/choice-field";
import { DialogActions } from "@/components/admin/common/dialog-actions";
import { useAdminAction } from "@/components/admin/common/use-admin-action";

type Settings = { enabled: boolean; maxLifetimeDays: number };

/**
 * The global switch and the maximum lifetime. Off by default. Turning keys off also makes every
 * existing key fail verification, without deleting it. Changes reach the auth server within a minute.
 */
export function ApiKeySettingsCard({
  settings,
  apiNames,
  verifyUrl,
  maxLifetimeLimit,
}: {
  settings: Settings;
  /** APIs keys can be created for. */
  apiNames: string[];
  verifyUrl: string;
  maxLifetimeLimit: number;
}) {
  const t = useTranslations("admin.pages.apiKeys");
  const tc = useTranslations("admin.common");
  const [open, setOpen] = React.useState(false);
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {t("title")}
          {settings.enabled ? (
            <Badge variant="secondary">{tc("on")}</Badge>
          ) : (
            <Badge variant="outline" className="font-normal">
              {tc("off")}
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="max-w-3xl">
          {t("settings.description")}
        </CardDescription>
        <CardAction>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Settings2Icon />
            {tc("edit")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div className="space-y-1">
            <dt className="text-muted-foreground text-xs">{tc("status")}</dt>
            <dd className="font-medium">
              {settings.enabled ? t("settings.statusOn") : t("settings.statusOff")}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-muted-foreground text-xs">{t("settings.maxLifetime")}</dt>
            <dd className="font-medium tabular-nums">{t("settings.maxLifetimeValue", { count: settings.maxLifetimeDays })}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-muted-foreground text-xs">{t("settings.apisAccepting")}</dt>
            <dd className="font-medium">
              {apiNames.length ? apiNames.join(", ") : t("settings.apisNone")}
            </dd>
          </div>
        </dl>
        <p className="text-muted-foreground text-xs">
          {t.rich("settings.verifyEndpoint", {
            endpoint: `POST ${verifyUrl}`,
            code: (chunks) => <code className="rounded bg-muted px-1 py-0.5 font-mono break-all">{chunks}</code>,
          })}
        </p>
      </CardContent>
      {open ? (
        <ApiKeySettingsDialog settings={settings} maxLifetimeLimit={maxLifetimeLimit} onClose={() => setOpen(false)} />
      ) : null}
    </Card>
  );
}

function ApiKeySettingsDialog({
  settings,
  maxLifetimeLimit,
  onClose,
}: {
  settings: Settings;
  maxLifetimeLimit: number;
  onClose: () => void;
}) {
  const t = useTranslations("admin.pages.apiKeys");
  const tc = useTranslations("admin.common");
  const { busy, run } = useAdminAction(onClose);
  const [enabled, setEnabled] = React.useState(settings.enabled);
  const [days, setDays] = React.useState(String(settings.maxLifetimeDays));

  function save(e: React.FormEvent) {
    e.preventDefault();
    void run(() => updateApiKeySettings({ enabled, maxLifetimeDays: Number(days) }), t("dialog.saved"));
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={save} className="grid gap-6">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>
              {t("dialog.description")}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <CheckboxField
                id="api-keys-enabled"
                checked={enabled}
                onChange={setEnabled}
                disabled={busy}
                label={t("dialog.allowLabel")}
                hint={t("dialog.allowHint")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="api-keys-max">{t("dialog.maxLifetimeLabel")}</FieldLabel>
              <Input
                id="api-keys-max"
                type="number"
                min={1}
                max={maxLifetimeLimit}
                step={1}
                inputMode="numeric"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                disabled={busy}
                className="w-32"
              />
              <FieldDescription>{t("dialog.maxLifetimeHint", { max: String(maxLifetimeLimit) })}</FieldDescription>
            </Field>
          </FieldGroup>
          <DialogActions busy={busy} onCancel={onClose} confirmLabel={tc("save")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
