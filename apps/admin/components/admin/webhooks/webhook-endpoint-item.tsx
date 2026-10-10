"use client";

import * as React from "react";
import { History, KeyRound, Loader2, Pencil, Send, Trash2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
import { Field, FieldGroup, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { Link } from "@/i18n/navigation";
import {
  deleteWebhook,
  rotateWebhookSecret,
  sendWebhookTest,
  updateWebhook,
} from "@/app/[locale]/(console)/webhooks/actions";
import { CheckboxField } from "@/components/admin/common/choice-field";
import { DialogActions } from "@/components/admin/common/dialog-actions";
import { useAdminAction } from "@/components/admin/common/use-admin-action";
import type { EventTypeOption, WebhookEndpointRow } from "@/components/admin/webhooks/admin-webhooks-panel";
import { EventChoices, SecretReveal } from "@/components/admin/webhooks/webhook-fields";

export function EndpointItem({ endpoint, eventTypes }: { endpoint: WebhookEndpointRow; eventTypes: EventTypeOption[] }) {
  const t = useTranslations("admin.pages.webhooks.panel");
  const tc = useTranslations("admin.common");
  const router = useRouter();
  const [dialog, setDialog] = React.useState<"edit" | "rotate" | "delete" | null>(null);
  const { busy, setBusy, run } = useAdminAction(() => setDialog(null));
  const [url, setUrl] = React.useState(endpoint.url);
  const [description, setDescription] = React.useState(endpoint.description ?? "");
  const [events, setEvents] = React.useState<Set<string>>(() => new Set(endpoint.events));
  const [enabled, setEnabled] = React.useState(endpoint.enabled);
  const [newSecret, setNewSecret] = React.useState<string | null>(null);
  const label = endpoint.description || endpoint.url;
  const disabledByFailures = !endpoint.enabled && endpoint.disabledReason === "failures";

  function openEdit() {
    setUrl(endpoint.url);
    setDescription(endpoint.description ?? "");
    setEvents(new Set(endpoint.events));
    setEnabled(endpoint.enabled);
    setDialog("edit");
  }

  function closeDialog() {
    if (busy) return;
    setDialog(null);
    setNewSecret(null);
  }

  async function sendTest() {
    setBusy(true);
    try {
      const res = await sendWebhookTest(endpoint.id);
      if (!res.ok) toast.error(res.error);
      else if (res.outcome.ok) toast.success(t("test.delivered", { status: String(res.outcome.status) }));
      else toast.error(t("test.failed", { reason: res.outcome.status ? `HTTP ${res.outcome.status}` : res.outcome.excerpt }));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function rotate() {
    setBusy(true);
    try {
      const res = await rotateWebhookSecret(endpoint.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setNewSecret(res.secret);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-lg border border-border px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <span className="break-all">{label}</span>
            {disabledByFailures ? (
              <Badge variant="destructive">{t("item.disabledFailures")}</Badge>
            ) : !endpoint.enabled ? (
              <Badge variant="outline">{tc("disabled")}</Badge>
            ) : null}
            {endpoint.rotating ? <Badge variant="outline">{t("item.rotating")}</Badge> : null}
          </p>
          {endpoint.description ? <p className="break-all font-mono text-xs text-muted-foreground">{endpoint.url}</p> : null}
          <div className="flex flex-wrap gap-1 pt-1">
            {endpoint.events.map((event) => (
              <Badge key={event} variant="secondary" className="font-mono font-normal">
                {event}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex gap-1">
          <Button type="button" size="icon-sm" variant="ghost" aria-label={t("item.editLabel", { label })} onClick={openEdit}>
            <Pencil className="size-4" aria-hidden />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label={t("item.deleteLabel", { label })} onClick={() => setDialog("delete")}>
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      {disabledByFailures ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {endpoint.disabledAt
              ? t("item.disabledNoticeOn", { date: endpoint.disabledAt, count: endpoint.consecutiveFailures })
              : t("item.disabledNotice", { count: endpoint.consecutiveFailures })}
          </span>
        </p>
      ) : null}

      <dl className="mt-3 grid gap-x-3 gap-y-1 border-t border-border/60 pt-3 text-xs sm:grid-cols-[auto_1fr]">
        <dt className="font-medium text-foreground">{t("item.lastSuccess")}</dt>
        <dd className="text-muted-foreground">{endpoint.lastSuccessAt ?? tc("never")}</dd>
        <dt className="font-medium text-foreground">{t("item.lastFailure")}</dt>
        <dd className="text-muted-foreground">
          {endpoint.lastFailureAt ?? tc("never")}
          {endpoint.enabled && endpoint.consecutiveFailures > 0 ? ` ${t("item.inARow", { count: endpoint.consecutiveFailures })}` : null}
        </dd>
        <dt className="font-medium text-foreground">{t("item.deliveries")}</dt>
        <dd className="text-muted-foreground">
          {t("item.deliveriesValue", { pending: endpoint.pending, failed: endpoint.failed })}
        </dd>
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="xs" variant="outline" disabled={busy || !endpoint.enabled} onClick={() => void sendTest()}>
          {busy && dialog === null ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Send className="size-3.5" aria-hidden />}
          {t("item.sendTest")}
        </Button>
        <Button size="xs" variant="outline" asChild>
          <Link href={`/webhooks/${endpoint.id}`}>
            <History className="size-3.5" aria-hidden />
            {t("item.deliveryLog")}
          </Link>
        </Button>
        <Button type="button" size="xs" variant="outline" disabled={busy} onClick={() => setDialog("rotate")}>
          <KeyRound className="size-3.5" aria-hidden />
          {t("item.regenerateSecret")}
        </Button>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          {dialog === "edit" ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("edit.title")}</DialogTitle>
                <DialogDescription className="break-all">{endpoint.url}</DialogDescription>
              </DialogHeader>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`url-${endpoint.id}`}>{t("url")}</FieldLabel>
                  <Input id={`url-${endpoint.id}`} type="url" value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy} />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`description-${endpoint.id}`}>{tc("description")}</FieldLabel>
                  <Input
                    id={`description-${endpoint.id}`}
                    value={description}
                    maxLength={200}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={busy}
                  />
                </Field>
                <EventChoices idPrefix={endpoint.id} eventTypes={eventTypes} selected={events} onChange={setEvents} disabled={busy} />
                <Field>
                  <CheckboxField
                    id={`enabled-${endpoint.id}`}
                    checked={enabled}
                    onChange={setEnabled}
                    disabled={busy}
                    label={tc("enabled")}
                    hint={t("edit.enabledHint")}
                  />
                </Field>
              </FieldGroup>
              <DialogActions
                busy={busy}
                onCancel={closeDialog}
                onConfirm={() => void run(() => updateWebhook(endpoint.id, { url, description, events: [...events], enabled }), t("edit.updated"))}
                confirmLabel={tc("save")}
                confirmDisabled={events.size === 0}
              />
            </>
          ) : dialog === "rotate" ? (
            <>
              <DialogHeader>
                <DialogTitle>{newSecret ? t("rotate.newTitle") : t("rotate.title")}</DialogTitle>
                <DialogDescription>
                  {newSecret ? t("rotate.newDescription") : t("rotate.description")}
                </DialogDescription>
              </DialogHeader>
              {newSecret ? (
                <>
                  <SecretReveal secret={newSecret} />
                  <DialogFooter>
                    <Button type="button" onClick={closeDialog}>
                      {tc("done")}
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <DialogActions busy={busy} onCancel={closeDialog} onConfirm={() => void rotate()} confirmLabel={t("rotate.confirm")} />
              )}
            </>
          ) : dialog === "delete" ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("delete.title")}</DialogTitle>
                <DialogDescription className="break-all">{t("delete.description", { url: endpoint.url })}</DialogDescription>
              </DialogHeader>
              <DialogActions
                busy={busy}
                onCancel={closeDialog}
                onConfirm={() => void run(() => deleteWebhook(endpoint.id), t("delete.deleted"))}
                confirmLabel={tc("delete")}
                destructive
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </li>
  );
}
