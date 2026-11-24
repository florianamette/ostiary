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
import {
  EMPTY_SCOPE_OPTIONS,
  ScopePickerField,
  scopeRequest,
  toggleScope,
  type ScopeOptions,
} from "@/components/admin/applications/scope-picker";
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

/** The APIs and scopes a new client may be limited to (machine-to-machine clients must be). */
export type MachineScopeOptions = ScopeOptions;

type ClientKind = "confidential" | "public" | "machine";

export function AdminRegisterOAuthClientDialog({
  machineScopes = EMPTY_SCOPE_OPTIONS,
  pairwiseAvailable = false,
  onCreated,
}: {
  machineScopes?: MachineScopeOptions;
  /** PAIRWISE_SECRET is set: offer pairwise user IDs. */
  pairwiseAvailable?: boolean;
  onCreated: () => void;
}) {
  const t = useTranslations("admin.pages.applications.register");
  const tc = useTranslations("admin.common");
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<"form" | "success">("form");
  const [clientName, setClientName] = React.useState("");
  // Empty: Better Auth generates one. Set for an app moved from another provider.
  const [customClientId, setCustomClientId] = React.useState("");
  const [redirectUrisRaw, setRedirectUrisRaw] = React.useState("");
  const [logoUri, setLogoUri] = React.useState("");
  const [clientKind, setClientKind] = React.useState<ClientKind>("confidential");
  const [scopes, setScopes] = React.useState<ReadonlySet<string>>(new Set());
  // Off: an app that signs users in may request every scope.
  const [limitScopes, setLimitScopes] = React.useState(false);
  const [skipConsent, setSkipConsent] = React.useState(false);
  const [pairwise, setPairwise] = React.useState(false);
  // Confidential and machine apps: a client secret, or private_key_jwt with the app's public keys.
  const [privateKeyJwt, setPrivateKeyJwt] = React.useState(false);
  const [jwksRaw, setJwksRaw] = React.useState("");
  const [backchannelUri, setBackchannelUri] = React.useState("");
  const [backchannelSession, setBackchannelSession] = React.useState(false);
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
    setCustomClientId("");
    setRedirectUrisRaw("");
    setLogoUri("");
    setClientKind("confidential");
    setScopes(new Set());
    setLimitScopes(false);
    setSkipConsent(false);
    setPairwise(false);
    setPrivateKeyJwt(false);
    setJwksRaw("");
    setBackchannelUri("");
    setBackchannelSession(false);
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
      client_id: customClientId.trim() || undefined,
      logo_uri: logoUri.trim() || undefined,
    };
    let auth: Record<string, unknown> = { token_endpoint_auth_method: "client_secret_basic" };
    if (clientKind !== "public" && privateKeyJwt) {
      let jwks: unknown;
      try {
        jwks = JSON.parse(jwksRaw);
      } catch {
        setFormError(t("jwksInvalidJson"));
        return;
      }
      auth = { token_endpoint_auth_method: "private_key_jwt", jwks };
    }
    let body: Record<string, unknown>;
    if (clientKind === "machine") {
      // Confidential, client_credentials only: no redirect URIs, consent or device sign-in.
      const { scope, resources } = scopeRequest({ ...machineScopes, oidcScopes: [] }, scopes);
      if (!scope) {
        setFormError(t("scopesRequired"));
        return;
      }
      body = {
        ...common,
        ...auth,
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
      // API access still needs a link to the API (APIs page), unless the API is open to every app.
      const { scope } = limitScopes ? scopeRequest(machineScopes, scopes) : { scope: "" };
      if (limitScopes && !scope) {
        setFormError(t("limitScopesRequired"));
        return;
      }
      body = {
        ...common,
        redirect_uris,
        ...(clientKind === "public" ? { token_endpoint_auth_method: "none" } : auth),
        grant_types: [
          "authorization_code",
          "refresh_token",
          ...(deviceCode ? [DEVICE_CODE_GRANT_TYPE] : []),
        ],
        response_types: ["code"],
        type: clientKind === "public" ? "native" : "web",
        skip_consent: skipConsent,
        ...(pairwise ? { subject_type: "pairwise" } : {}),
        ...(backchannelUri.trim()
          ? { backchannel_logout_uri: backchannelUri.trim(), backchannel_logout_session_required: backchannelSession }
          : {}),
        enable_end_session: endSession,
        ...(endSession && post_logout_redirect_uris.length
          ? { post_logout_redirect_uris }
          : {}),
        ...(scope ? { scope } : {}),
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
                    setScopes(new Set());
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
              {clientKind === "public" ? null : (
                <Field>
                  <FieldLabel htmlFor="oauth-reg-auth-method">{t("authMethodLabel")}</FieldLabel>
                  <Select
                    value={privateKeyJwt ? "private_key_jwt" : "client_secret"}
                    onValueChange={(v) => setPrivateKeyJwt(v === "private_key_jwt")}
                  >
                    <SelectTrigger id="oauth-reg-auth-method" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client_secret">{t("authMethodSecret")}</SelectItem>
                      <SelectItem value="private_key_jwt">{t("authMethodPrivateKey")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
              {clientKind !== "public" && privateKeyJwt ? (
                <Field>
                  <FieldLabel htmlFor="oauth-reg-jwks">{t("jwksLabel")}</FieldLabel>
                  <Textarea
                    id="oauth-reg-jwks"
                    required
                    rows={5}
                    className="font-mono text-xs"
                    spellCheck={false}
                    placeholder='{"keys": [{"kty": "EC", "crv": "P-256", "x": "…", "y": "…", "kid": "…"}]}'
                    value={jwksRaw}
                    onChange={(e) => setJwksRaw(e.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">{t("jwksHint")}</p>
                </Field>
              ) : null}
              {clientKind === "machine" ? (
                <ScopePickerField
                  idPrefix="oauth-reg-scope"
                  options={machineScopes}
                  apiOnly
                  selected={scopes}
                  onToggle={(scope, checked) => setScopes((current) => toggleScope(current, scope, checked))}
                  label={t("scopesLabel")}
                  hint={t.rich("scopesHint", { grant: "client_credentials", code: (c) => <code>{c}</code> })}
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
              <Field>
                <FieldLabel htmlFor="oauth-reg-client-id">{t("clientIdLabel")}</FieldLabel>
                <Input
                  id="oauth-reg-client-id"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={128}
                  value={customClientId}
                  onChange={(e) => setCustomClientId(e.target.value)}
                />
                <p className="text-muted-foreground text-xs">{t("clientIdHint")}</p>
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
                      id="oauth-reg-limit-scopes"
                      checked={limitScopes}
                      onChange={setLimitScopes}
                      label={t("limitScopesLabel")}
                      hint={t("limitScopesHint")}
                    />
                  </Field>
                  {limitScopes ? (
                    <ScopePickerField
                      idPrefix="oauth-reg-limit-scope"
                      options={machineScopes}
                      apiOnly={false}
                      selected={scopes}
                      onToggle={(scope, checked) => setScopes((current) => toggleScope(current, scope, checked))}
                      label={t("allowedScopesLabel")}
                      hint={t("allowedScopesHint")}
                    />
                  ) : null}
                  <Field>
                    <FieldLabel htmlFor="oauth-reg-backchannel">{t("backchannelUriLabel")}</FieldLabel>
                    <Input
                      id="oauth-reg-backchannel"
                      type="url"
                      placeholder="https://app.example.com/backchannel-logout"
                      value={backchannelUri}
                      onChange={(e) => setBackchannelUri(e.target.value)}
                    />
                    <p className="text-muted-foreground text-xs">{t("backchannelUriHint")}</p>
                  </Field>
                  {backchannelUri.trim() ? (
                    <Field>
                      <CheckboxField
                        id="oauth-reg-backchannel-session"
                        checked={backchannelSession}
                        onChange={setBackchannelSession}
                        label={t("backchannelSessionLabel")}
                        hint={t("backchannelSessionHint")}
                      />
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
                  {pairwiseAvailable ? (
                    <Field>
                      <CheckboxField
                        id="oauth-reg-pairwise"
                        checked={pairwise}
                        onChange={setPairwise}
                        label={t("pairwiseLabel")}
                        hint={t("pairwiseHint")}
                      />
                    </Field>
                  ) : null}
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
                {privateKeyJwt && clientKind !== "public"
                  ? t("successPrivateKey")
                  : !issuedSecret
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
