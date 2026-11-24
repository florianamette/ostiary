"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@ostiary/core/components/ui/badge";
import { Button } from "@ostiary/core/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@ostiary/core/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@ostiary/core/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";

import { removeCustomProviderAction, saveCustomProviderAction } from "@/app/[locale]/(console)/sign-in-providers/actions";
import { CheckboxField } from "@/components/admin/common/choice-field";
import { ConfirmRemoveDialog } from "@/components/admin/common/confirm-remove-dialog";
import { DialogActions } from "@/components/admin/common/dialog-actions";
import { useAdminAction } from "@/components/admin/common/use-admin-action";

export type CustomProviderRow = {
  id: string;
  enabled: boolean;
  allowSignUp: boolean;
  name: string;
  discoveryUrl: string;
  clientId: string;
  scopes: string;
  secretSet: boolean;
  secretUnreadable: boolean;
  callbackUrl: string;
  linkedAccounts: number;
};

const PREFIX = "oidc-";
const DEFAULT_SCOPES = "openid email profile";

/** Custom OpenID Connect sign-in providers (custom-oauth-providers.ts). */
export function CustomProvidersCard({ providers, authAppUrl }: { providers: CustomProviderRow[]; authAppUrl: string }) {
  const t = useTranslations("admin.pages.signInProviders.custom");
  const [editing, setEditing] = React.useState<CustomProviderRow | "new" | null>(null);
  const [removing, setRemoving] = React.useState<CustomProviderRow | null>(null);
  const remove = useAdminAction(() => setRemoving(null));

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription className="max-w-3xl">{t("description")}</CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => setEditing("new")}>
            {t("add")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {providers.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <ul className="divide-y divide-border/80">
            {providers.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    <Badge variant={p.enabled ? "default" : "outline"}>{p.enabled ? t("on") : t("off")}</Badge>
                  </div>
                  <code className="text-muted-foreground block truncate font-mono text-xs">{p.discoveryUrl}</code>
                  {p.linkedAccounts > 0 ? (
                    <p className="text-muted-foreground text-xs">{t("linkedAccounts", { count: p.linkedAccounts })}</p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(p)} aria-label={t("editProvider", { name: p.name })}>
                    {t("edit")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setRemoving(p)} aria-label={t("removeProvider", { name: p.name })}>
                    {t("remove")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {editing ? (
        <CustomProviderDialog provider={editing === "new" ? null : editing} authAppUrl={authAppUrl} onClose={() => setEditing(null)} />
      ) : null}
      <ConfirmRemoveDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t("removeTitle", { name: removing?.name ?? "" })}
        description={t("removeDescription")}
        pending={remove.busy}
        confirmLabel={t("remove")}
        cancelLabel={t("cancel")}
        onConfirm={() => removing && void remove.run(() => removeCustomProviderAction(removing.id), t("removed"))}
      />
    </Card>
  );
}

function CustomProviderDialog({ provider, authAppUrl, onClose }: { provider: CustomProviderRow | null; authAppUrl: string; onClose: () => void }) {
  const t = useTranslations("admin.pages.signInProviders.custom");
  const { busy, run } = useAdminAction(onClose);
  const [slug, setSlug] = React.useState("");
  const [name, setName] = React.useState(provider?.name ?? "");
  const [discoveryUrl, setDiscoveryUrl] = React.useState(provider?.discoveryUrl ?? "");
  const [clientId, setClientId] = React.useState(provider?.clientId ?? "");
  const [clientSecret, setClientSecret] = React.useState("");
  const [scopes, setScopes] = React.useState(provider?.scopes ?? DEFAULT_SCOPES);
  const [enabled, setEnabled] = React.useState(provider?.enabled ?? true);
  const [allowSignUp, setAllowSignUp] = React.useState(provider?.allowSignUp ?? true);
  const id = provider?.id ?? `${PREFIX}${slug.trim().toLowerCase() || "…"}`;
  const callbackUrl = provider?.callbackUrl ?? `${authAppUrl}/api/auth/callback/${id}`;

  function save(e: React.FormEvent) {
    e.preventDefault();
    void run(
      () =>
        saveCustomProviderAction(provider?.id ?? null, {
          ...(provider ? {} : { slug }),
          name,
          discoveryUrl,
          clientId,
          // Empty keeps the stored secret.
          ...(clientSecret.trim() ? { clientSecret } : {}),
          scopes,
          enabled,
          allowSignUp,
        }),
      t("saved"),
    );
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={save} className="grid gap-6">
          <DialogHeader>
            <DialogTitle>{provider ? t("editTitle", { name: provider.name }) : t("addTitle")}</DialogTitle>
            <DialogDescription>{t("dialogDescription")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="custom-provider-name">{t("name")}</FieldLabel>
              <Input id="custom-provider-name" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Keycloak" />
              <FieldDescription>{t("nameHint")}</FieldDescription>
            </Field>
            {provider ? null : (
              <Field>
                <FieldLabel htmlFor="custom-provider-slug">{t("slug")}</FieldLabel>
                <Input
                  id="custom-provider-slug"
                  required
                  maxLength={32}
                  pattern="[a-z0-9](?:[a-z0-9\-]{0,30}[a-z0-9])?"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  placeholder="keycloak"
                />
                <FieldDescription>{t("slugHint")}</FieldDescription>
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="custom-provider-callback">{t("callbackUrl")}</FieldLabel>
              <Input id="custom-provider-callback" readOnly value={callbackUrl} className="font-mono text-xs" />
              <FieldDescription>{t("callbackUrlHint")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="custom-provider-discovery">{t("discoveryUrl")}</FieldLabel>
              <Input
                id="custom-provider-discovery"
                type="url"
                required
                value={discoveryUrl}
                onChange={(e) => setDiscoveryUrl(e.target.value)}
                placeholder="https://sso.example.com/realms/main/.well-known/openid-configuration"
              />
              <FieldDescription>{t("discoveryUrlHint")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="custom-provider-client-id">{t("clientId")}</FieldLabel>
              <Input id="custom-provider-client-id" required autoComplete="off" value={clientId} onChange={(e) => setClientId(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="custom-provider-client-secret">{t("clientSecret")}</FieldLabel>
              <Input
                id="custom-provider-client-secret"
                type="password"
                autoComplete="new-password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={provider?.secretSet ? t("secretKept") : ""}
              />
              <FieldDescription>{provider?.secretUnreadable ? t("secretUnreadable") : t("clientSecretHint")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="custom-provider-scopes">{t("scopes")}</FieldLabel>
              <Input id="custom-provider-scopes" value={scopes} onChange={(e) => setScopes(e.target.value)} />
              <FieldDescription>{t("scopesHint")}</FieldDescription>
            </Field>
            <Field>
              <CheckboxField id="custom-provider-enabled" checked={enabled} onChange={setEnabled} disabled={busy} label={t("enabled")} hint={t("enabledHint")} />
            </Field>
            <Field>
              <CheckboxField id="custom-provider-sign-up" checked={allowSignUp} onChange={setAllowSignUp} disabled={busy} label={t("allowSignUp")} hint={t("allowSignUpHint")} />
            </Field>
          </FieldGroup>
          <DialogActions busy={busy} onCancel={onClose} cancelLabel={t("cancel")} confirmLabel={t("save")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
