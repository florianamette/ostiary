"use client";

import * as React from "react";
import { CopyIcon, PlusCircleIcon } from "lucide-react";

import { Button } from "@ostiary/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@ostiary/core/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@ostiary/core/components/ui/field";
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
import { MotionPanel } from "@ostiary/core/components/motion/motion-panel";
import { adminNotify } from "@ostiary/core/lib/admin/admin-notify";

function parseRedirectUris(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

export function AdminRegisterOAuthClientDialog({
  onCreated,
}: {
  onCreated: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<"form" | "success">("form");
  const [clientName, setClientName] = React.useState("");
  const [redirectUrisRaw, setRedirectUrisRaw] = React.useState("");
  const [clientKind, setClientKind] = React.useState<"confidential" | "public">(
    "confidential"
  );
  const [skipConsent, setSkipConsent] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [issuedClientId, setIssuedClientId] = React.useState("");
  const [issuedSecret, setIssuedSecret] = React.useState<string | null>(null);

  function reset() {
    setStep("form");
    setClientName("");
    setRedirectUrisRaw("");
    setClientKind("confidential");
    setSkipConsent(false);
    setFormError(null);
    setIssuedClientId("");
    setIssuedSecret(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const redirect_uris = parseRedirectUris(redirectUrisRaw);
    if (redirect_uris.length === 0) {
      setFormError("Enter at least one redirect URI (one per line or comma-separated).");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/admin/oauth-clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          redirect_uris,
          client_name: clientName.trim() || undefined,
          token_endpoint_auth_method:
            clientKind === "public" ? "none" : "client_secret_basic",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          type: clientKind === "public" ? "native" : "web",
          skip_consent: skipConsent,
        }),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const err =
          json &&
          typeof json === "object" &&
          "error" in json &&
          typeof (json as { error?: unknown }).error === "string"
            ? (json as { error: string }).error
            : "Could not register application";
        setFormError(err);
        return;
      }
      const payload =
        json &&
        typeof json === "object" &&
        "data" in json &&
        (json as { data: unknown }).data !== undefined
          ? (json as { data: unknown }).data
          : json;
      const o = asRecord(payload);
      const cid = o ? String(o.client_id ?? o.clientId ?? "") : "";
      if (!cid) {
        setFormError("Server did not return a client_id.");
        return;
      }
      const secretRaw = o?.client_secret ?? o?.clientSecret;
      const secret =
        typeof secretRaw === "string" && secretRaw.length > 0
          ? secretRaw
          : null;
      setIssuedClientId(cid);
      setIssuedSecret(secret);
      setStep("success");
      adminNotify("OAuth application registered");
      onCreated();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" type="button">
          <PlusCircleIcon />
          Register application
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {step === "form" ? (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Register OAuth application</DialogTitle>
              <DialogDescription>
                Creates a client tied to your account via{" "}
                <code className="text-foreground">POST /api/admin/oauth-clients</code>{" "}
                (trusted apps can set{" "}
                <code className="text-foreground">skip_consent</code>). See{" "}
                <a
                  href="https://better-auth.com/docs/plugins/oauth-provider#create-client"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Better Auth, Create client
                </a>
                .
              </DialogDescription>
            </DialogHeader>
            <MotionPanel>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="oauth-reg-name">Application name</FieldLabel>
                <Input
                  id="oauth-reg-name"
                  placeholder="My app"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="oauth-reg-redirects">
                  Redirect URIs
                </FieldLabel>
                <Textarea
                  id="oauth-reg-redirects"
                  required
                  rows={4}
                  placeholder={
                    "https://app.example.com/oauth/callback\nhttp://127.0.0.1:3000/callback"
                  }
                  value={redirectUrisRaw}
                  onChange={(e) => setRedirectUrisRaw(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-muted-foreground text-xs">
                  {clientKind === "public"
                    ? "One per line or comma-separated. HTTPS, or http on localhost, 127.0.0.1 or [::1]."
                    : "One per line or comma-separated. HTTPS only, localhost included. For local development, register a separate public client."}
                </p>
              </Field>
              <Field>
                <FieldLabel>Client type</FieldLabel>
                <Select
                  value={clientKind}
                  onValueChange={(v) =>
                    setClientKind(v as "confidential" | "public")
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confidential">
                      Confidential (client secret)
                    </SelectItem>
                    <SelectItem value="public">
                      Public (PKCE, no secret)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <div className="flex gap-3 rounded-md border border-border/80 bg-muted/30 p-3">
                  <input
                    id="oauth-reg-skip-consent"
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0 rounded border-input"
                    checked={skipConsent}
                    onChange={(e) => setSkipConsent(e.target.checked)}
                  />
                  <div className="grid gap-1">
                    <Label
                      htmlFor="oauth-reg-skip-consent"
                      className="cursor-pointer font-medium leading-none"
                    >
                      Skip consent (trusted client)
                    </Label>
                    <p className="text-muted-foreground text-xs leading-snug">
                      Users will not see the consent screen for this application.
                      Use only for first-party or fully trusted integrations.
                    </p>
                  </div>
                </div>
              </Field>
              {formError ? (
                <p className="text-destructive text-sm" role="alert">
                  {formError}
                </p>
              ) : null}
            </FieldGroup>
            </MotionPanel>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating…" : "Create application"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Application created</DialogTitle>
              <DialogDescription>
                {issuedSecret
                  ? "Copy the client secret now, it may only be shown once."
                  : "Public client, no secret is issued. Use PKCE at the token endpoint."}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel>Client ID</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    className="font-mono text-xs"
                    value={issuedClientId}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label="Copy client ID"
                    onClick={() => {
                      void navigator.clipboard.writeText(issuedClientId);
                    }}
                  >
                    <CopyIcon />
                  </Button>
                </div>
              </Field>
              {issuedSecret ? (
                <Field>
                  <FieldLabel>Client secret</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      className="font-mono text-xs"
                      value={issuedSecret}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label="Copy client secret"
                      onClick={() => {
                        void navigator.clipboard.writeText(issuedSecret);
                      }}
                    >
                      <CopyIcon />
                    </Button>
                  </div>
                </Field>
              ) : null}
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
