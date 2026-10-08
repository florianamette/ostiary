"use client";

import * as React from "react";
import { Loader2, Pencil, Trash2, TriangleAlert } from "lucide-react";
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
import { Textarea } from "@ostiary/core/components/ui/textarea";
import {
  ACCESS_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
  RESERVED_CLAIMS,
  type ApiAccess,
  type TokenSettings,
} from "@ostiary/core/lib/oauth-resource-policy";
import { createApi, deleteApi, setApiAccess, updateApi, updateApiTokens } from "@/app/[locale]/(console)/apis/actions";

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
  access: ApiAccess;
  /** Applications linked to the API (`oauth_client_resource`). */
  linkedClientIds: string[];
  tokens: TokenSettings;
};

export type ApplicationOption = { clientId: string; name: string; disabled: boolean };

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

function RadioField({
  id,
  name,
  checked,
  onChange,
  disabled,
  label,
  hint,
}: {
  id: string;
  name: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex gap-3 rounded-md border border-border/80 bg-muted/30 p-3 has-checked:border-primary/60">
      <input
        id={id}
        name={name}
        type="radio"
        className="mt-0.5 size-4 shrink-0"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
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

/** A lifetime in seconds, in the largest unit that divides it. */
function formatDuration(seconds: number): string {
  if (seconds % 86_400 === 0) return seconds === 86_400 ? "1 day" : `${seconds / 86_400} days`;
  if (seconds % 3_600 === 0) return `${seconds / 3_600} h`;
  return `${Math.round(seconds / 60)} min`;
}

/** The token settings that differ from the defaults, for the API list. */
function tokenSummary(tokens: TokenSettings): string[] {
  const claims = Object.keys(tokens.customClaims ?? {});
  return [
    tokens.accessTokenTtl !== null ? `Access token ${formatDuration(tokens.accessTokenTtl)}` : null,
    tokens.refreshTokenTtl !== null ? `Refresh token ${formatDuration(tokens.refreshTokenTtl)}` : null,
    tokens.dpopBoundAccessTokensRequired ? "DPoP required" : null,
    claims.length > 0 ? `Claims: ${claims.join(", ")}` : null,
  ].filter((part): part is string => part !== null);
}

const RESTRICT_HINT =
  "Tokens for this API carry only these scopes (and the OpenID Connect ones). Off: they carry every scope the client was granted.";

/**
 * Registers APIs (OAuth protected resources) and the scopes clients may request for them.
 * New scopes reach the auth app within a minute, without a redeploy.
 */
export function AdminApisPanel({
  apis,
  applications,
  envScopes,
}: {
  apis: ApiRow[];
  applications: ApplicationOption[];
  envScopes: string[];
}) {
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
          <CardDescription>
            New and changed scopes reach the auth server within a minute. Access and token settings apply to the next token.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {apis.length === 0 ? (
            <p className="text-sm text-muted-foreground">No API yet.</p>
          ) : (
            <ul className="space-y-3">
              {apis.map((api) => (
                <ApiItem key={api.identifier} api={api} applications={applications} />
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

const CLAIMS_PLACEHOLDER = '{\n  "tenant": "acme"\n}';

function ApiItem({ api, applications }: { api: ApiRow; applications: ApplicationOption[] }) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<"edit" | "access" | "tokens" | "delete" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [name, setName] = React.useState(api.name);
  const [scopes, setScopes] = React.useState(api.scopes.join(" "));
  const [restrict, setRestrict] = React.useState(api.restrict);
  const [disabled, setDisabled] = React.useState(api.disabled);
  const [access, setAccess] = React.useState<ApiAccess>(api.access);
  const [linked, setLinked] = React.useState<Set<string>>(() => new Set(api.linkedClientIds));
  const [appFilter, setAppFilter] = React.useState("");
  const [accessMinutes, setAccessMinutes] = React.useState("");
  const [refreshDays, setRefreshDays] = React.useState("");
  const [claims, setClaims] = React.useState("");
  const [dpop, setDpop] = React.useState(false);
  const id = encodeURIComponent(api.identifier);

  const appNames = new Map(applications.map((app) => [app.clientId, app.name]));
  const linkedNames = api.linkedClientIds.map((clientId) => appNames.get(clientId) ?? clientId);
  const tokens = tokenSummary(api.tokens);
  const filter = appFilter.trim().toLowerCase();
  const shownApplications = filter
    ? applications.filter((app) => app.name.toLowerCase().includes(filter) || app.clientId.toLowerCase().includes(filter))
    : applications;

  function openEdit() {
    setName(api.name);
    setScopes(api.scopes.join(" "));
    setRestrict(api.restrict);
    setDisabled(api.disabled);
    setDialog("edit");
  }

  function openAccess() {
    setAccess(api.access);
    setLinked(new Set(api.linkedClientIds));
    setAppFilter("");
    setDialog("access");
  }

  function openTokens() {
    setAccessMinutes(api.tokens.accessTokenTtl !== null ? String(api.tokens.accessTokenTtl / 60) : "");
    setRefreshDays(api.tokens.refreshTokenTtl !== null ? String(api.tokens.refreshTokenTtl / 86_400) : "");
    setClaims(api.tokens.customClaims ? JSON.stringify(api.tokens.customClaims, null, 2) : "");
    setDpop(api.tokens.dpopBoundAccessTokensRequired);
    setDialog("tokens");
  }

  function toggleLinked(clientId: string, checked: boolean) {
    setLinked((current) => {
      const next = new Set(current);
      if (checked) next.add(clientId);
      else next.delete(clientId);
      return next;
    });
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
            {api.access === "linked" ? <Badge variant="outline">Linked apps only</Badge> : null}
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

      <dl className="mt-3 grid gap-2 border-t border-border/60 pt-3 text-xs sm:grid-cols-[auto_1fr_auto] sm:items-baseline sm:gap-x-3">
        <dt className="font-medium text-foreground">Applications</dt>
        <dd className="min-w-0 text-muted-foreground">
          {api.access === "all" ? (
            "Every application"
          ) : linkedNames.length > 0 ? (
            <span className="break-words">Only {linkedNames.join(", ")}</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-destructive">
              <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
              None linked: no application can get tokens
            </span>
          )}
        </dd>
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="justify-self-start"
          aria-label={`Change which applications can use ${api.name}`}
          onClick={openAccess}
        >
          Change
        </Button>
        <dt className="font-medium text-foreground">Tokens</dt>
        <dd className="min-w-0 break-words text-muted-foreground">{tokens.length > 0 ? tokens.join(" · ") : "Default settings"}</dd>
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="justify-self-start"
          aria-label={`Change the token settings of ${api.name}`}
          onClick={openTokens}
        >
          Change
        </Button>
      </dl>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && !busy && setDialog(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
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
          ) : dialog === "access" ? (
            <>
              <DialogHeader>
                <DialogTitle>Applications that can use {api.name}</DialogTitle>
                <DialogDescription className="break-all">{api.identifier}</DialogDescription>
              </DialogHeader>
              <FieldGroup>
                <Field>
                  <RadioField
                    id={`access-all-${id}`}
                    name={`access-${id}`}
                    checked={access === "all"}
                    onChange={() => setAccess("all")}
                    disabled={busy}
                    label="Every application"
                    hint="Any application can get tokens for this API, within its scopes."
                  />
                  {api.authServer ? null : (
                    <RadioField
                      id={`access-linked-${id}`}
                      name={`access-${id}`}
                      checked={access === "linked"}
                      onChange={() => setAccess("linked")}
                      disabled={busy}
                      label="Only linked applications"
                      hint="Other applications are refused (invalid_target), including when they refresh a token."
                    />
                  )}
                </Field>
                <Field>
                  <FieldTitle>Linked applications</FieldTitle>
                  {applications.length > 6 ? (
                    <Input
                      type="search"
                      aria-label="Filter applications"
                      value={appFilter}
                      onChange={(e) => setAppFilter(e.target.value)}
                      disabled={busy}
                      placeholder="Filter by name or client ID"
                    />
                  ) : null}
                  {applications.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No application yet.</p>
                  ) : (
                    <ul className="max-h-56 divide-y divide-border/60 overflow-y-auto rounded-md border border-border/80">
                      {shownApplications.map((app) => {
                        const checkboxId = `link-${id}-${encodeURIComponent(app.clientId)}`;
                        return (
                          <li key={app.clientId} className="flex items-center gap-3 px-3 py-2">
                            <input
                              id={checkboxId}
                              type="checkbox"
                              className="size-4 shrink-0 rounded border-input"
                              checked={linked.has(app.clientId)}
                              disabled={busy}
                              onChange={(e) => toggleLinked(app.clientId, e.target.checked)}
                            />
                            <Label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 font-normal">
                              <span className="flex flex-wrap items-center gap-1.5 text-sm">
                                {app.name}
                                {app.disabled ? <Badge variant="destructive">Disabled</Badge> : null}
                              </span>
                              <span className="block max-w-full truncate font-mono text-xs text-muted-foreground">{app.clientId}</span>
                            </Label>
                          </li>
                        );
                      })}
                      {shownApplications.length === 0 ? (
                        <li className="px-3 py-2 text-sm text-muted-foreground">No application matches.</li>
                      ) : null}
                    </ul>
                  )}
                  <FieldDescription>
                    {access === "all"
                      ? "Links only matter once the API is limited to linked applications. A linked application can also introspect this API's tokens."
                      : "A linked application can also introspect this API's tokens."}
                  </FieldDescription>
                  {access === "linked" && linked.size === 0 ? (
                    <p className="flex items-center gap-1.5 text-xs text-destructive">
                      <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                      No application is linked: none can get tokens for this API.
                    </p>
                  ) : null}
                </Field>
              </FieldGroup>
              <DialogFooter>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => setApiAccess(api.identifier, { access, clientIds: [...linked] }), "Access updated")}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  Save
                </Button>
              </DialogFooter>
            </>
          ) : dialog === "tokens" ? (
            <>
              <DialogHeader>
                <DialogTitle>Token settings for {api.name}</DialogTitle>
                <DialogDescription>
                  Applied to every access token issued for this API. Tokens already issued keep their settings.
                </DialogDescription>
              </DialogHeader>
              <FieldGroup>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor={`access-ttl-${id}`}>Access token lifetime (minutes)</FieldLabel>
                    <Input
                      id={`access-ttl-${id}`}
                      type="number"
                      inputMode="decimal"
                      min={1}
                      max={ACCESS_TOKEN_EXPIRES_IN / 60}
                      step="any"
                      value={accessMinutes}
                      onChange={(e) => setAccessMinutes(e.target.value)}
                      disabled={busy}
                      placeholder={String(ACCESS_TOKEN_EXPIRES_IN / 60)}
                    />
                    <FieldDescription>Default: {ACCESS_TOKEN_EXPIRES_IN / 60} minutes. Can only be shorter.</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`refresh-ttl-${id}`}>Refresh token lifetime (days)</FieldLabel>
                    <Input
                      id={`refresh-ttl-${id}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={REFRESH_TOKEN_EXPIRES_IN / 86_400}
                      step="any"
                      value={refreshDays}
                      onChange={(e) => setRefreshDays(e.target.value)}
                      disabled={busy}
                      placeholder={String(REFRESH_TOKEN_EXPIRES_IN / 86_400)}
                    />
                    <FieldDescription>Default: {REFRESH_TOKEN_EXPIRES_IN / 86_400} days. Can only be shorter.</FieldDescription>
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor={`claims-${id}`}>Custom claims</FieldLabel>
                  <Textarea
                    id={`claims-${id}`}
                    className="min-h-24 font-mono text-xs"
                    value={claims}
                    onChange={(e) => setClaims(e.target.value)}
                    disabled={busy}
                    placeholder={CLAIMS_PLACEHOLDER}
                    spellCheck={false}
                  />
                  <FieldDescription>
                    A JSON object added to every access token for this API. Reserved:{" "}
                    <span className="font-mono">{RESERVED_CLAIMS.join(", ")}</span>.
                  </FieldDescription>
                </Field>
                <Field>
                  <CheckboxField
                    id={`dpop-${id}`}
                    checked={dpop}
                    onChange={setDpop}
                    disabled={busy}
                    label="Require DPoP-bound tokens"
                    hint="Clients must send a DPoP proof to get a token for this API, and the token is bound to their key. The API must check the proof on each request."
                  />
                </Field>
              </FieldGroup>
              <DialogFooter>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        updateApiTokens(api.identifier, {
                          accessTokenMinutes: accessMinutes,
                          refreshTokenDays: refreshDays,
                          customClaims: claims,
                          dpopRequired: dpop,
                        }),
                      "Token settings saved",
                    )
                  }
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
