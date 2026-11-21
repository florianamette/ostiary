"use client";

import * as React from "react";
import { CopyIcon, PlusCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

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
import { DEVICE_CODE_GRANT_TYPE } from "@ostiary/core/lib/admin/oauth-clients/oauth-client-admin.types";
import { CheckboxField } from "@/components/admin/common/choice-field";
import { ExternalLink } from "@/components/admin/common/external-link";
import { asRecord, parseRedirectUris, routeError } from "@/lib/oauth-client-payload";

/** The client ID and secret (null for a public client) in the create route's answer. */
function issuedCredentials(json: unknown): { clientId: string; secret: string | null } {
  const payload =
    json &&
    typeof json === "object" &&
    "data" in json &&
    (json as { data: unknown }).data !== undefined
      ? (json as { data: unknown }).data
      : json;
  const o = asRecord(payload);
  const clientId = o ? String(o.client_id ?? o.clientId ?? "") : "";
  const secretRaw = o?.client_secret ?? o?.clientSecret;
  const secret =
    typeof secretRaw === "string" && secretRaw.length > 0
      ? secretRaw
      : null;
  return { clientId, secret };
}

/** A value shown once after registration, with a copy button. */
function IssuedValue({ label, copyLabel, value }: { label: string; copyLabel: string; value: string }) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex gap-2">
        <Input
          readOnly
          className="font-mono text-xs"
          value={value}
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label={copyLabel}
          onClick={() => {
            void navigator.clipboard.writeText(value);
          }}
        >
          <CopyIcon />
        </Button>
      </div>
    </Field>
  );
}

/** The APIs (with their scopes) and the other API scopes a machine-to-machine client may get. */
export type MachineScopeOptions = {
  apis: { identifier: string; name: string; scopes: string[] }[];
  /** API scopes no API declares (OAUTH_API_SCOPES). */
  otherScopes: string[];
};

type ClientKind = "confidential" | "public" | "machine";

/** One scope checkbox in the machine-to-machine scope picker. */
function ScopeCheckbox({
  id,
  scope,
  checked,
  onChange,
}: {
  id: string;
  scope: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        className="size-4 shrink-0 rounded border-input"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <Label htmlFor={id} className="cursor-pointer font-mono text-xs font-normal">
        {scope}
      </Label>
    </div>
  );
}

/**
 * Picks the scopes of a machine-to-machine client, grouped by API. The client is linked to
 * the APIs whose scopes are picked (see `machineRequest`).
 */
function MachineScopesField({
  options,
  selected,
  onToggle,
}: {
  options: MachineScopeOptions;
  selected: ReadonlySet<string>;
  onToggle: (scope: string, checked: boolean) => void;
}) {
  const t = useTranslations("admin.pages.applications.register");
  const groups = [
    ...options.apis.map((api) => ({ key: api.identifier, name: api.name, detail: api.identifier, scopes: api.scopes })),
    ...(options.otherScopes.length
      ? [{ key: "other", name: t("otherScopes"), detail: null, scopes: options.otherScopes }]
      : []),
  ];
  return (
    <Field>
      <FieldLabel>{t("scopesLabel")}</FieldLabel>
      {groups.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("noApiScopes")}</p>
      ) : (
        <div className="grid max-h-48 gap-2 overflow-y-auto">
          {groups.map((group, index) => (
            <fieldset key={group.key} className="grid gap-2 rounded-md border border-border/80 bg-muted/30 p-3">
              <legend className="sr-only">{group.name}</legend>
              <div className="grid gap-0.5">
                <span className="text-sm font-medium">{group.name}</span>
                {group.detail ? (
                  <code className="text-muted-foreground truncate font-mono text-xs">{group.detail}</code>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {group.scopes.map((scope) => (
                  <ScopeCheckbox
                    key={scope}
                    id={`oauth-reg-scope-${index}-${scope}`}
                    scope={scope}
                    checked={selected.has(scope)}
                    onChange={(checked) => onToggle(scope, checked)}
                  />
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      )}
      <p className="text-muted-foreground text-xs">
        {t.rich("scopesHint", { grant: "client_credentials", code: (c) => <code>{c}</code> })}
      </p>
    </Field>
  );
}

/** The scope and the APIs (whose scopes are picked) of a new machine-to-machine client. */
function machineRequest(options: MachineScopeOptions, selected: ReadonlySet<string>) {
  const all = [...options.apis.flatMap((api) => api.scopes), ...options.otherScopes];
  const scope = [...new Set(all)].filter((s) => selected.has(s)).join(" ");
  const resources = options.apis
    .filter((api) => api.scopes.some((s) => selected.has(s)))
    .map((api) => api.identifier);
  return { scope, resources };
}

export function AdminRegisterOAuthClientDialog({
  machineScopes = { apis: [], otherScopes: [] },
  onCreated,
}: {
  machineScopes?: MachineScopeOptions;
  onCreated: () => void;
}) {
  const t = useTranslations("admin.pages.applications.register");
  const tc = useTranslations("admin.common");
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<"form" | "success">("form");
  const [clientName, setClientName] = React.useState("");
  const [redirectUrisRaw, setRedirectUrisRaw] = React.useState("");
  const [logoUri, setLogoUri] = React.useState("");
  const [clientKind, setClientKind] = React.useState<ClientKind>("confidential");
  const [scopes, setScopes] = React.useState<ReadonlySet<string>>(new Set());
  const [skipConsent, setSkipConsent] = React.useState(false);
  const [deviceCode, setDeviceCode] = React.useState(false);
  // On for new apps: signing out of the app can then end the Ostiary session too.
  const [endSession, setEndSession] = React.useState(true);
  const [postLogoutUrisRaw, setPostLogoutUrisRaw] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [issuedClientId, setIssuedClientId] = React.useState("");
  const [issuedSecret, setIssuedSecret] = React.useState<string | null>(null);

  function reset() {
    setStep("form");
    setClientName("");
    setRedirectUrisRaw("");
    setLogoUri("");
    setClientKind("confidential");
    setScopes(new Set());
    setSkipConsent(false);
    setDeviceCode(false);
    setEndSession(true);
    setPostLogoutUrisRaw("");
    setFormError(null);
    setIssuedClientId("");
    setIssuedSecret(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const common = {
      client_name: clientName.trim() || undefined,
      logo_uri: logoUri.trim() || undefined,
    };
    let body: Record<string, unknown>;
    if (clientKind === "machine") {
      // Confidential, client_credentials only: no redirect URIs, consent or device sign-in.
      const { scope, resources } = machineRequest(machineScopes, scopes);
      if (!scope) {
        setFormError(t("scopesRequired"));
        return;
      }
      body = {
        ...common,
        token_endpoint_auth_method: "client_secret_basic",
        grant_types: ["client_credentials"],
        type: "web",
        scope,
        resources,
      };
    } else {
      const redirect_uris = parseRedirectUris(redirectUrisRaw);
      if (redirect_uris.length === 0) {
        setFormError(t("redirectUrisRequired"));
        return;
      }
      const post_logout_redirect_uris = parseRedirectUris(postLogoutUrisRaw);
      body = {
        ...common,
        redirect_uris,
        token_endpoint_auth_method:
          clientKind === "public" ? "none" : "client_secret_basic",
        grant_types: [
          "authorization_code",
          "refresh_token",
          ...(deviceCode ? [DEVICE_CODE_GRANT_TYPE] : []),
        ],
        response_types: ["code"],
        type: clientKind === "public" ? "native" : "web",
        skip_consent: skipConsent,
        enable_end_session: endSession,
        ...(endSession && post_logout_redirect_uris.length
          ? { post_logout_redirect_uris }
          : {}),
      };
    }
    setPending(true);
    try {
      const res = await fetch("/api/admin/oauth-clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(routeError(json) ?? t("registerFailed"));
        return;
      }
      const { clientId: cid, secret } = issuedCredentials(json);
      if (!cid) {
        setFormError(t("missingClientId", { field: "client_id" }));
        return;
      }
      setIssuedClientId(cid);
      setIssuedSecret(secret);
      setStep("success");
      toast.success(t("registered"));
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
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        {step === "form" ? (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{t("title")}</DialogTitle>
              <DialogDescription>
                {t.rich("description", {
                  endpoint: "POST /api/admin/oauth-clients",
                  field: "skip_consent",
                  code: (c) => <code className="text-foreground">{c}</code>,
                  link: (c) => (
                    <ExternalLink href="https://better-auth.com/docs/plugins/oauth-provider#create-client">{c}</ExternalLink>
                  ),
                })}
              </DialogDescription>
            </DialogHeader>
            <MotionPanel>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="oauth-reg-name">{t("nameLabel")}</FieldLabel>
                <Input
                  id="oauth-reg-name"
                  placeholder={t("namePlaceholder")}
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="oauth-reg-type">{t("clientTypeLabel")}</FieldLabel>
                <Select
                  value={clientKind}
                  onValueChange={(v) => {
                    setClientKind(v as ClientKind);
                    setFormError(null);
                  }}
                >
                  <SelectTrigger id="oauth-reg-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confidential">
                      {t("clientTypeConfidential")}
                    </SelectItem>
                    <SelectItem value="public">
                      {t("clientTypePublic")}
                    </SelectItem>
                    <SelectItem value="machine">
                      {t("clientTypeMachine")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {clientKind === "machine" ? (
                <MachineScopesField
                  options={machineScopes}
                  selected={scopes}
                  onToggle={(scope, checked) =>
                    setScopes((current) => {
                      const next = new Set(current);
                      if (checked) next.add(scope);
                      else next.delete(scope);
                      return next;
                    })
                  }
                />
              ) : (
                <Field>
                  <FieldLabel htmlFor="oauth-reg-redirects">
                    {t("redirectUrisLabel")}
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
                      ? t("redirectUrisHintPublic")
                      : t("redirectUrisHintConfidential")}
                  </p>
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="oauth-reg-icon">{t("iconUrlLabel")}</FieldLabel>
                <Input
                  id="oauth-reg-icon"
                  type="url"
                  placeholder="https://example.com/icon.png"
                  value={logoUri}
                  onChange={(e) => setLogoUri(e.target.value)}
                />
                <p className="text-muted-foreground text-xs">{t("iconUrlHint")}</p>
              </Field>
              {clientKind === "machine" ? null : (
                <>
                  <Field>
                    <CheckboxField
                      id="oauth-reg-device-code"
                      checked={deviceCode}
                      onChange={setDeviceCode}
                      label={t("deviceCodeLabel")}
                      hint={t.rich("deviceCodeHint", {
                        path: "/device",
                        code: (c) => <code>{c}</code>,
                      })}
                    />
                  </Field>
                  <Field>
                    <CheckboxField
                      id="oauth-reg-end-session"
                      checked={endSession}
                      onChange={setEndSession}
                      label={t("endSessionLabel")}
                      hint={t("endSessionHint")}
                    />
                  </Field>
                  {endSession ? (
                    <Field>
                      <FieldLabel htmlFor="oauth-reg-post-logout">
                        {t("postLogoutUrisLabel")}
                      </FieldLabel>
                      <Textarea
                        id="oauth-reg-post-logout"
                        rows={2}
                        placeholder="https://app.example.com/"
                        value={postLogoutUrisRaw}
                        onChange={(e) => setPostLogoutUrisRaw(e.target.value)}
                        className="font-mono text-sm"
                      />
                      <p className="text-muted-foreground text-xs">{t("postLogoutUrisHint")}</p>
                    </Field>
                  ) : null}
                  <Field>
                    <CheckboxField
                      id="oauth-reg-skip-consent"
                      checked={skipConsent}
                      onChange={setSkipConsent}
                      label={t("skipConsentLabel")}
                      hint={t("skipConsentHint")}
                    />
                  </Field>
                </>
              )}
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
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? t("creating") : t("create")}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("successTitle")}</DialogTitle>
              <DialogDescription>
                {!issuedSecret
                  ? t("successPublic")
                  : clientKind === "machine"
                    ? t("successMachine", { grant: "client_credentials" })
                    : t("successWithSecret")}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-4">
              <IssuedValue label={t("clientId")} copyLabel={t("copyClientId")} value={issuedClientId} />
              {issuedSecret ? (
                <IssuedValue label={t("clientSecret")} copyLabel={t("copyClientSecret")} value={issuedSecret} />
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
                {tc("done")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
