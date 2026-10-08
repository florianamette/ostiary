"use client";

import * as React from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { Label } from "@ostiary/core/components/ui/label";
import { createApi, deleteApi, updateApi } from "@/app/[locale]/(console)/apis/actions";

export type ApiRow = {
  identifier: string;
  name: string;
  scopes: string[];
  restrict: boolean;
  disabled: boolean;
  /** The auth server's own resource: tokens issued without a `resource` parameter. */
  authServer: boolean;
  /** Listed in OAUTH_API_AUDIENCES: the build registers it again if deleted. */
  fromEnv: boolean;
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

const RESTRICT_HINT =
  "Tokens for this API carry only these scopes (and the OpenID Connect ones). Off: they carry every scope the client was granted.";

/**
 * Registers APIs (OAuth protected resources) and the scopes clients may request for them.
 * New scopes reach the auth app within a minute, without a redeploy.
 */
export function AdminApisPanel({ apis, envScopes }: { apis: ApiRow[]; envScopes: string[] }) {
  const router = useRouter();
  const [identifier, setIdentifier] = React.useState("");
  const [name, setName] = React.useState("");
  const [scopes, setScopes] = React.useState("");
  const [restrict, setRestrict] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await createApi({ identifier, name, scopes, restrict });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("API registered");
      setIdentifier("");
      setName("");
      setScopes("");
      setRestrict(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[2fr_3fr]">
      <Card className="h-fit border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Register an API</CardTitle>
          <CardDescription>
            Clients ask for a token for it with the <code className="font-mono text-xs">resource</code>{" "}parameter. The token&apos;s audience is the identifier, and the API verifies it against the JWKS.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="api-identifier">Identifier</FieldLabel>
                <Input
                  id="api-identifier"
                  type="url"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  disabled={submitting}
                  placeholder="https://api.example.com"
                  required
                />
                <FieldDescription>Usually the API&apos;s base URL. It cannot be changed later.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="api-name">Name</FieldLabel>
                <Input id="api-name" value={name} onChange={(e) => setName(e.target.value)} disabled={submitting} placeholder="Orders API" />
              </Field>
              <Field>
                <FieldLabel htmlFor="api-scopes">Scopes</FieldLabel>
                <Input
                  id="api-scopes"
                  value={scopes}
                  onChange={(e) => setScopes(e.target.value)}
                  disabled={submitting}
                  placeholder="orders:read orders:write"
                />
                <FieldDescription>Separated by spaces or commas. Machine clients (client_credentials) must be limited to some of them.</FieldDescription>
              </Field>
              <Field>
                <CheckboxField
                  id="api-restrict"
                  checked={restrict}
                  onChange={setRestrict}
                  disabled={submitting}
                  label="Only issue these scopes for this API"
                  hint={RESTRICT_HINT}
                />
              </Field>
              <Field>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  {submitting ? "Registering…" : "Register API"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <Card className="h-fit border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>APIs</CardTitle>
          <CardDescription>New and changed scopes reach the auth server within a minute.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {apis.length === 0 ? (
            <p className="text-sm text-muted-foreground">No API yet.</p>
          ) : (
            <ul className="space-y-3">
              {apis.map((api) => (
                <ApiItem key={api.identifier} api={api} />
              ))}
            </ul>
          )}
          {envScopes.length > 0 ? (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
              <p className="font-medium text-foreground">Scopes from OAUTH_API_SCOPES</p>
              <p className="mt-1 text-muted-foreground">
                Available to every client, whichever API it calls:{" "}
                <span className="font-mono">{envScopes.join(" ")}</span>. To manage them here, add them to the API they belong to, then remove the variable.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function ApiItem({ api }: { api: ApiRow }) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<"edit" | "delete" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [name, setName] = React.useState(api.name);
  const [scopes, setScopes] = React.useState(api.scopes.join(" "));
  const [restrict, setRestrict] = React.useState(api.restrict);
  const [disabled, setDisabled] = React.useState(api.disabled);
  const id = encodeURIComponent(api.identifier);

  function openEdit() {
    setName(api.name);
    setScopes(api.scopes.join(" "));
    setRestrict(api.restrict);
    setDisabled(api.disabled);
    setDialog("edit");
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

  return (
    <li className="rounded-lg border border-border px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {api.name}
            {api.authServer ? <Badge variant="secondary">Auth server</Badge> : null}
            {api.fromEnv && !api.authServer ? <Badge variant="outline">OAUTH_API_AUDIENCES</Badge> : null}
            {api.disabled ? <Badge variant="destructive">Disabled</Badge> : null}
            {api.restrict ? <Badge variant="outline">Restricted</Badge> : null}
          </p>
          {api.name !== api.identifier ? (
            <p className="break-all font-mono text-xs text-muted-foreground">{api.identifier}</p>
          ) : null}
          {api.scopes.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {api.scopes.map((scope) => (
                <Badge key={scope} variant="secondary" className="font-mono font-normal">
                  {scope}
                </Badge>
              ))}
            </div>
          ) : api.authServer ? (
            <p className="text-xs text-muted-foreground">Tokens issued without a resource parameter.</p>
          ) : (
            <p className="text-xs text-muted-foreground">No scopes.</p>
          )}
        </div>
        <div className="flex gap-1">
          <Button type="button" size="icon-sm" variant="ghost" aria-label={`Edit ${api.name}`} onClick={openEdit}>
            <Pencil className="size-4" aria-hidden />
          </Button>
          {api.fromEnv ? null : (
            <Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete ${api.name}`} onClick={() => setDialog("delete")}>
              <Trash2 className="size-4" aria-hidden />
            </Button>
          )}
        </div>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && !busy && setDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          {dialog === "edit" ? (
            <>
              <DialogHeader>
                <DialogTitle>Edit {api.name}</DialogTitle>
                <DialogDescription className="break-all">{api.identifier}</DialogDescription>
              </DialogHeader>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`name-${id}`}>Name</FieldLabel>
                  <Input id={`name-${id}`} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`scopes-${id}`}>Scopes</FieldLabel>
                  <Input id={`scopes-${id}`} value={scopes} onChange={(e) => setScopes(e.target.value)} disabled={busy} />
                  <FieldDescription>Removing a scope does not change clients that already have it, but no new token carries it.</FieldDescription>
                </Field>
                <Field>
                  <CheckboxField
                    id={`restrict-${id}`}
                    checked={restrict}
                    onChange={setRestrict}
                    disabled={busy}
                    label="Only issue these scopes for this API"
                    hint={RESTRICT_HINT}
                  />
                </Field>
                {api.authServer ? null : (
                  <Field>
                    <CheckboxField
                      id={`disabled-${id}`}
                      checked={disabled}
                      onChange={setDisabled}
                      disabled={busy}
                      label="Disabled"
                      hint="No new tokens for this API. Tokens already issued work until they expire."
                    />
                  </Field>
                )}
              </FieldGroup>
              <DialogFooter>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => updateApi(api.identifier, { name, scopes, restrict, disabled }), "API updated")}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  Save
                </Button>
              </DialogFooter>
            </>
          ) : dialog === "delete" ? (
            <>
              <DialogHeader>
                <DialogTitle>Delete {api.name}?</DialogTitle>
                <DialogDescription>
                  Clients can no longer get tokens for it, and the tokens already issued for it stop working at once. To stop new tokens only, disable it instead.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button type="button" variant="destructive" disabled={busy} onClick={() => void run(() => deleteApi(api.identifier), "API deleted")}>
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
