"use client";

import * as React from "react";
import { Loader2, Settings2Icon } from "lucide-react";
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
import { updateApiKeySettings } from "@/app/[locale]/(console)/api-keys/actions";

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
  const [open, setOpen] = React.useState(false);
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          API keys
          {settings.enabled ? (
            <Badge variant="secondary">On</Badge>
          ) : (
            <Badge variant="outline" className="font-normal">
              Off
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="max-w-3xl">
          People create keys from their account page for one of your APIs and some of its scopes. The API checks
          each key with this server. A key never signs anyone in to this server or the admin console.
        </CardDescription>
        <CardAction>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Settings2Icon />
            Edit
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div className="space-y-1">
            <dt className="text-muted-foreground text-xs">Status</dt>
            <dd className="font-medium">
              {settings.enabled ? "On: people can create keys" : "Off: no new keys, and every key is refused"}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-muted-foreground text-xs">Maximum lifetime</dt>
            <dd className="font-medium tabular-nums">{settings.maxLifetimeDays} days</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-muted-foreground text-xs">APIs accepting keys</dt>
            <dd className="font-medium">
              {apiNames.length ? apiNames.join(", ") : "None: register an API with scopes, open to every application"}
            </dd>
          </div>
        </dl>
        <p className="text-muted-foreground text-xs">
          Verification endpoint:{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono break-all">POST {verifyUrl}</code>. The API authenticates as an
          application registered here, linked to that API (APIs page, Access). APIs limited to linked applications do
          not accept keys.
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
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [enabled, setEnabled] = React.useState(settings.enabled);
  const [days, setDays] = React.useState(String(settings.maxLifetimeDays));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await updateApiKeySettings({ enabled, maxLifetimeDays: Number(days) });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Settings saved. The auth server applies them within a minute.");
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={save} className="grid gap-6">
          <DialogHeader>
            <DialogTitle>API keys</DialogTitle>
            <DialogDescription>
              Keys are long-lived: prefer short lifetimes. Lowering the maximum applies to new keys only.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <div className="flex gap-3 rounded-md border border-border/80 bg-muted/30 p-3">
                <input
                  id="api-keys-enabled"
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 rounded border-input"
                  checked={enabled}
                  disabled={busy}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                <div className="grid gap-1">
                  <Label htmlFor="api-keys-enabled" className="cursor-pointer font-medium leading-none">
                    Allow API keys
                  </Label>
                  <p className="text-muted-foreground text-xs leading-snug">
                    Off: nobody can create a key and every existing key is refused at verification. Keys are kept,
                    and work again when you turn this back on.
                  </p>
                </div>
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="api-keys-max">Maximum lifetime (days)</FieldLabel>
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
              <FieldDescription>From 1 to {maxLifetimeLimit}. Every key expires.</FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
