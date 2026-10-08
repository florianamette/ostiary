"use client";

import * as React from "react";
import { CopyIcon, History, KeyRound, Loader2, Pencil, Send, Trash2, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@ostiary/core/components/ui/badge";
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
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { Label } from "@ostiary/core/components/ui/label";
import { Link } from "@/i18n/navigation";
import {
  createWebhook,
  deleteWebhook,
  rotateWebhookSecret,
  sendWebhookTest,
  updateWebhook,
} from "@/app/[locale]/(console)/webhooks/actions";

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

type Result = { ok: true } | { ok: false; error: string };

function EventChoices({
  idPrefix,
  eventTypes,
  selected,
  onChange,
  disabled,
}: {
  idPrefix: string;
  eventTypes: EventTypeOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}) {
  const all = selected.size === eventTypes.length;
  return (
    <Field>
      <div className="flex items-center justify-between gap-2">
        <FieldTitle>Events</FieldTitle>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={disabled}
          onClick={() => onChange(all ? new Set() : new Set(eventTypes.map((e) => e.type)))}
        >
          {all ? "Clear" : "Select all"}
        </Button>
      </div>
      <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto rounded-md border border-border/80">
        {eventTypes.map((event) => {
          const id = `${idPrefix}-${event.type}`;
          return (
            <li key={event.type} className="flex items-start gap-3 px-3 py-2">
              <input
                id={id}
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 rounded border-input"
                checked={selected.has(event.type)}
                disabled={disabled}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(event.type);
                  else next.delete(event.type);
                  onChange(next);
                }}
              />
              <Label htmlFor={id} className="min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 font-normal">
                <span className="font-mono text-xs">{event.type}</span>
                <span className="text-xs text-muted-foreground">{event.description}</span>
              </Label>
            </li>
          );
        })}
      </ul>
    </Field>
  );
}

/** Shows a signing secret once, with a copy button. */
function SecretReveal({ secret }: { secret: string }) {
  return (
    <div className="grid gap-2 py-2">
      <Label htmlFor="webhook-secret">Signing secret</Label>
      <Input id="webhook-secret" readOnly value={secret} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => void navigator.clipboard.writeText(secret).then(() => toast.success("Secret copied"))}
      >
        <CopyIcon aria-hidden />
        Copy secret
      </Button>
    </div>
  );
}

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
          <CardTitle>Add an endpoint</CardTitle>
          <CardDescription>
            Ostiary POSTs a signed JSON event to this URL when one of the chosen events happens, and retries for about a day if it fails.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="webhook-url">URL</FieldLabel>
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
                  HTTPS, on a public address.
                  {allowLocalhost ? " http://localhost is accepted (WEBHOOKS_ALLOW_LOCALHOST, development only)." : null}
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="webhook-description">Description</FieldLabel>
                <Input
                  id="webhook-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={submitting}
                  maxLength={200}
                  placeholder="Billing app: user sync"
                />
              </Field>
              <EventChoices idPrefix="new" eventTypes={eventTypes} selected={events} onChange={setEvents} disabled={submitting} />
              <Field>
                <Button type="submit" disabled={submitting || events.size === 0}>
                  {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  {submitting ? "Adding…" : "Add endpoint"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <Card className="h-fit border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Endpoints</CardTitle>
          <CardDescription>
            Every request carries the <code className="font-mono text-xs">webhook-id</code>,{" "}
            <code className="font-mono text-xs">webhook-timestamp</code> and{" "}
            <code className="font-mono text-xs">webhook-signature</code> headers (Standard Webhooks). An endpoint that fails {autoDisableAfter} times in a row is disabled.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {endpoints.length === 0 ? (
            <p className="text-sm text-muted-foreground">No endpoint yet.</p>
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
            <DialogTitle>Endpoint added</DialogTitle>
            <DialogDescription className="break-all">
              Copy the signing secret into the app at {created?.url}: it verifies each delivery with it. It is not shown again.
            </DialogDescription>
          </DialogHeader>
          {created ? <SecretReveal secret={created.secret} /> : null}
          <DialogFooter>
            <Button type="button" onClick={() => setCreated(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EndpointItem({ endpoint, eventTypes }: { endpoint: WebhookEndpointRow; eventTypes: EventTypeOption[] }) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<"edit" | "rotate" | "delete" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [url, setUrl] = React.useState(endpoint.url);
  const [description, setDescription] = React.useState(endpoint.description ?? "");
  const [events, setEvents] = React.useState<Set<string>>(() => new Set(endpoint.events));
  const [enabled, setEnabled] = React.useState(endpoint.enabled);
  const [newSecret, setNewSecret] = React.useState<string | null>(null);
  const label = endpoint.description || endpoint.url;

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

  async function run(fn: () => Promise<Result>, success: string) {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(success);
      setDialog(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      const res = await sendWebhookTest(endpoint.id);
      if (!res.ok) toast.error(res.error);
      else if (res.outcome.ok) toast.success(`Test event delivered (HTTP ${res.outcome.status})`);
      else toast.error(`Test event failed: ${res.outcome.status ? `HTTP ${res.outcome.status}` : res.outcome.excerpt}`);
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
            {!endpoint.enabled && endpoint.disabledReason === "failures" ? (
              <Badge variant="destructive">Disabled after repeated failures</Badge>
            ) : !endpoint.enabled ? (
              <Badge variant="outline">Disabled</Badge>
            ) : null}
            {endpoint.rotating ? <Badge variant="outline">Secret rotating</Badge> : null}
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
          <Button type="button" size="icon-sm" variant="ghost" aria-label={`Edit ${label}`} onClick={openEdit}>
            <Pencil className="size-4" aria-hidden />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete ${label}`} onClick={() => setDialog("delete")}>
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      {!endpoint.enabled && endpoint.disabledReason === "failures" ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Disabled {endpoint.disabledAt ? `on ${endpoint.disabledAt} ` : null}after {endpoint.consecutiveFailures} failed attempts in a row. Fix the receiver, then turn it back on: pending events are sent again.
          </span>
        </p>
      ) : null}

      <dl className="mt-3 grid gap-x-3 gap-y-1 border-t border-border/60 pt-3 text-xs sm:grid-cols-[auto_1fr]">
        <dt className="font-medium text-foreground">Last success</dt>
        <dd className="text-muted-foreground">{endpoint.lastSuccessAt ?? "Never"}</dd>
        <dt className="font-medium text-foreground">Last failure</dt>
        <dd className="text-muted-foreground">
          {endpoint.lastFailureAt ?? "Never"}
          {endpoint.enabled && endpoint.consecutiveFailures > 0 ? ` (${endpoint.consecutiveFailures} in a row)` : null}
        </dd>
        <dt className="font-medium text-foreground">Deliveries</dt>
        <dd className="text-muted-foreground">
          {endpoint.pending} waiting or retrying · {endpoint.failed} failed
        </dd>
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="xs" variant="outline" disabled={busy || !endpoint.enabled} onClick={() => void sendTest()}>
          {busy && dialog === null ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Send className="size-3.5" aria-hidden />}
          Send test event
        </Button>
        <Button size="xs" variant="outline" asChild>
          <Link href={`/webhooks/${endpoint.id}`}>
            <History className="size-3.5" aria-hidden />
            Delivery log
          </Link>
        </Button>
        <Button type="button" size="xs" variant="outline" disabled={busy} onClick={() => setDialog("rotate")}>
          <KeyRound className="size-3.5" aria-hidden />
          Regenerate secret
        </Button>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          {dialog === "edit" ? (
            <>
              <DialogHeader>
                <DialogTitle>Edit endpoint</DialogTitle>
                <DialogDescription className="break-all">{endpoint.url}</DialogDescription>
              </DialogHeader>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`url-${endpoint.id}`}>URL</FieldLabel>
                  <Input id={`url-${endpoint.id}`} type="url" value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy} />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`description-${endpoint.id}`}>Description</FieldLabel>
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
                  <div className="flex gap-3 rounded-md border border-border/80 bg-muted/30 p-3">
                    <input
                      id={`enabled-${endpoint.id}`}
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0 rounded border-input"
                      checked={enabled}
                      disabled={busy}
                      onChange={(e) => setEnabled(e.target.checked)}
                    />
                    <div className="grid gap-1">
                      <Label htmlFor={`enabled-${endpoint.id}`} className="cursor-pointer font-medium leading-none">
                        Enabled
                      </Label>
                      <p className="text-muted-foreground text-xs leading-snug">
                        While disabled, new events are not recorded for this endpoint and retries wait.
                      </p>
                    </div>
                  </div>
                </Field>
              </FieldGroup>
              <DialogFooter>
                <Button type="button" variant="outline" disabled={busy} onClick={closeDialog}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={busy || events.size === 0}
                  onClick={() => void run(() => updateWebhook(endpoint.id, { url, description, events: [...events], enabled }), "Endpoint updated")}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  Save
                </Button>
              </DialogFooter>
            </>
          ) : dialog === "rotate" ? (
            <>
              <DialogHeader>
                <DialogTitle>{newSecret ? "New signing secret" : "Regenerate the signing secret?"}</DialogTitle>
                <DialogDescription>
                  {newSecret
                    ? "Copy it into the app now: it is not shown again. For the next 24 hours, deliveries carry a signature with the old secret too."
                    : "Deliveries are signed with both the old and the new secret for 24 hours, so the app can switch without missing events."}
                </DialogDescription>
              </DialogHeader>
              {newSecret ? <SecretReveal secret={newSecret} /> : null}
              <DialogFooter>
                {newSecret ? (
                  <Button type="button" onClick={closeDialog}>
                    Done
                  </Button>
                ) : (
                  <>
                    <Button type="button" variant="outline" disabled={busy} onClick={closeDialog}>
                      Cancel
                    </Button>
                    <Button type="button" disabled={busy} onClick={() => void rotate()}>
                      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                      Regenerate
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          ) : dialog === "delete" ? (
            <>
              <DialogHeader>
                <DialogTitle>Delete this endpoint?</DialogTitle>
                <DialogDescription className="break-all">
                  {endpoint.url} stops receiving events, and its delivery log and pending retries are deleted. To pause it, disable it instead.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" variant="outline" disabled={busy} onClick={closeDialog}>
                  Cancel
                </Button>
                <Button type="button" variant="destructive" disabled={busy} onClick={() => void run(() => deleteWebhook(endpoint.id), "Endpoint deleted")}>
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  Delete
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </li>
  );
}
