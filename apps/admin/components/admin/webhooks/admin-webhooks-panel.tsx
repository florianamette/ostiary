"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { createWebhook } from "@/app/[locale]/(console)/webhooks/actions";
import { EndpointItem } from "@/components/admin/webhooks/webhook-endpoint-item";
import { EventChoices, SecretReveal } from "@/components/admin/webhooks/webhook-fields";

export type WebhookEndpointRow = {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  enabled: boolean;
  /** "manual" (an admin) or "failures" (disabled automatically). */
  disabledReason: string | null;
  disabledAt: string | null;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  /** The previous secret still signs deliveries (rotation in the last 24 hours). */
  rotating: boolean;
  pending: number;
  failed: number;
};

export type EventTypeOption = { type: string; description: string };

/**
 * Webhook endpoints: apps that want to hear about user and membership changes. Each delivery
 * is signed (Standard Webhooks) with the endpoint's secret, shown only when it is created.
 */
export function AdminWebhooksPanel({
  endpoints,
  eventTypes,
  allowLocalhost,
  autoDisableAfter,
}: {
  endpoints: WebhookEndpointRow[];
  eventTypes: EventTypeOption[];
  allowLocalhost: boolean;
  autoDisableAfter: number;
}) {
  const t = useTranslations("admin.pages.webhooks.panel");
  const tc = useTranslations("admin.common");
  const router = useRouter();
  const [url, setUrl] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [events, setEvents] = React.useState<Set<string>>(() => new Set(eventTypes.map((e) => e.type)));
  const [submitting, setSubmitting] = React.useState(false);
  const [created, setCreated] = React.useState<{ url: string; secret: string } | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await createWebhook({ url, description, events: [...events] });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setCreated({ url, secret: res.secret });
      setUrl("");
      setDescription("");
      setEvents(new Set(eventTypes.map((e) => e.type)));
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[2fr_3fr]">
      <Card className="h-fit border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>{t("add.title")}</CardTitle>
          <CardDescription>{t("add.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="webhook-url">{t("url")}</FieldLabel>
                <Input
                  id="webhook-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={submitting}
                  placeholder="https://app.example.com/webhooks/ostiary"
                  required
                />
                <FieldDescription>
                  {allowLocalhost
                    ? t("add.urlHintLocalhost", { url: "http://localhost", envVar: "WEBHOOKS_ALLOW_LOCALHOST" })
                    : t("add.urlHint")}
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="webhook-description">{tc("description")}</FieldLabel>
                <Input
                  id="webhook-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={submitting}
                  maxLength={200}
                  placeholder={t("add.descriptionPlaceholder")}
                />
              </Field>
              <EventChoices idPrefix="new" eventTypes={eventTypes} selected={events} onChange={setEvents} disabled={submitting} />
              <Field>
                <Button type="submit" disabled={submitting || events.size === 0}>
                  {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  {submitting ? t("add.adding") : t("add.submit")}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <Card className="h-fit border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>{t("list.title")}</CardTitle>
          <CardDescription>
            {t.rich("list.description", {
              id: "webhook-id",
              timestamp: "webhook-timestamp",
              signature: "webhook-signature",
              count: autoDisableAfter,
              code: (chunks) => <code className="font-mono text-xs">{chunks}</code>,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {endpoints.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("list.empty")}</p>
          ) : (
            <ul className="space-y-3">
              {endpoints.map((endpoint) => (
                <EndpointItem key={endpoint.id} endpoint={endpoint} eventTypes={eventTypes} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={created !== null} onOpenChange={(open) => !open && setCreated(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("created.title")}</DialogTitle>
            <DialogDescription className="break-all">{t("created.description", { url: created?.url ?? "" })}</DialogDescription>
          </DialogHeader>
          {created ? <SecretReveal secret={created.secret} /> : null}
          <DialogFooter>
            <Button type="button" onClick={() => setCreated(null)}>
              {tc("done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
