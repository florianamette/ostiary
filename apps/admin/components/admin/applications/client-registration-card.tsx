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

const DYNAMIC_LABELS: Record<DynamicRegistrationMode, string> = {
  off: "Off",
  signed_in: "Signed-in users only",
  open: "Anyone (open registration)",
};

const DYNAMIC_HINTS: Record<DynamicRegistrationMode, string> = {
  off: "POST /oauth2/register is refused.",
  signed_in: "Only requests carrying a user's session may register. Most MCP clients cannot.",
  open: "What MCP clients expect: any app may register, then each user approves it on the consent screen.",
};

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
  const [open, setOpen] = React.useState(false);
  const enabled = settings.dynamic !== "off" || settings.metadataDocuments;
  const missing = settings.scopes.filter((scope) => !availableScopes.includes(scope));

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Self-registration
          {enabled ? <Badge variant="secondary">On</Badge> : <Badge variant="outline" className="font-normal">Off</Badge>}
        </CardTitle>
        <CardDescription className="max-w-3xl">
          Lets MCP clients and AI agents register themselves instead of being added here. They only get the scopes
          below, always show the consent screen marked as unverified, and never get machine (client credentials)
          access.
        </CardDescription>
        <CardAction>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Settings2Icon />
            Edit
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <dt className="text-muted-foreground text-xs">Dynamic registration</dt>
            <dd className="font-medium">{DYNAMIC_LABELS[settings.dynamic]}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-muted-foreground text-xs">Metadata documents (client_id URL)</dt>
            <dd className="font-medium">
              {settings.metadataDocuments
                ? settings.metadataDocumentHosts.length
                  ? `On, from ${settings.metadataDocumentHosts.join(", ")}`
                  : "On, any HTTPS host"
                : "Off"}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-muted-foreground text-xs">Scopes they may request</dt>
            <dd className="flex flex-wrap gap-1">
              {settings.scopes.map((scope) => (
                <Badge
                  key={scope}
                  variant={missing.includes(scope) ? "destructive" : "secondary"}
                  className="font-mono font-normal"
                  title={missing.includes(scope) ? "No longer a scope of this server: ignored" : undefined}
                >
                  {scope}
                </Badge>
              ))}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-muted-foreground text-xs">New clients per hour</dt>
            <dd className="font-medium tabular-nums">{settings.maxRegistrationsPerHour}</dd>
          </div>
        </dl>
        {settings.dynamic !== "off" && authServer ? (
          <p className="text-muted-foreground mt-4 text-xs break-all">
            Registration endpoint:{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">{authServer}/api/auth/oauth2/register</code>
            {" "}(advertised in the discovery document).
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
      toast.success("Settings saved. The auth server applies them within a minute.");
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
            <DialogTitle>Self-registration</DialogTitle>
            <DialogDescription>
              Clients that register themselves are not reviewed. People see them as unverified apps and approve each
              one on the consent screen.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="registration-dynamic">Dynamic Client Registration (RFC 7591)</FieldLabel>
              <Select value={dynamic} onValueChange={(v) => setDynamic(v as DynamicRegistrationMode)} disabled={busy}>
                <SelectTrigger id="registration-dynamic" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DYNAMIC_LABELS) as DynamicRegistrationMode[]).map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {DYNAMIC_LABELS[mode]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>{DYNAMIC_HINTS[dynamic]}</FieldDescription>
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
                    Client ID Metadata Documents
                  </Label>
                  <p className="text-muted-foreground text-xs leading-snug">
                    The client_id is an HTTPS URL to the app&apos;s JSON metadata, as newer MCP clients use. Only public
                    hosts are fetched, without redirects, 5 KB at most.
                  </p>
                </div>
              </div>
            </Field>
            {metadataDocuments ? (
              <Field>
                <FieldLabel htmlFor="registration-hosts">Allowed hosts</FieldLabel>
                <Textarea
                  id="registration-hosts"
                  value={hosts}
                  onChange={(e) => setHosts(e.target.value)}
                  disabled={busy}
                  rows={3}
                  placeholder={"claude.ai\nvscode.dev"}
                  className="font-mono text-sm"
                />
                <FieldDescription>One per line. Empty: any public HTTPS host.</FieldDescription>
              </Field>
            ) : null}
            <Field>
              <FieldLabel>Scopes self-registered clients may request</FieldLabel>
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
                Each user still approves the scopes an app asks for. Removing a scope also removes it from clients
                already registered; tokens already issued keep it until they expire.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="registration-max">New clients per hour</FieldLabel>
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
                Across every instance, for both methods. Each address is also limited to 5 registrations a minute.
              </FieldDescription>
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
