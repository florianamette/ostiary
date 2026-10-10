"use client";

import * as React from "react";
import { CheckCircle2, Copy, FileKey2, Loader2, Pencil, ShieldAlert, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
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
  DialogHeader,
  DialogTitle,
} from "@ostiary/core/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ostiary/core/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ostiary/core/components/ui/tabs";
import { authClient } from "@/lib/auth-client";
import { DialogActions } from "@/components/admin/common/dialog-actions";
import { useAdminAction } from "@/components/admin/common/use-admin-action";
import {
  SamlDetailsDialogBody,
  SamlEditDialogBody,
  SamlRegisterForm,
  type SamlProviderDetails,
} from "@/components/admin/sso/admin-saml";
import {
  checkDomainVerification,
  deleteSsoProvider,
  getDomainVerificationRecord,
  updateSsoProvider,
} from "@/app/[locale]/(console)/sso/actions";

type SsoProviderRow = {
  providerId: string;
  issuer: string;
  domain: string;
  domainVerified: boolean;
  organizationId: string | null;
  organizationName: string | null;
  protocol: "oidc" | "saml";
  saml: SamlProviderDetails | null;
};

type Org = { id: string; name: string };
const NO_ORG = "__none__";

function OrganizationSelect({ id, value, onChange, organizations, disabled }: { id: string; value: string; onChange: (v: string) => void; organizations: Org[]; disabled?: boolean }) {
  const t = useTranslations("sso.panel");
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_ORG}>{t("noOrganization")}</SelectItem>
        {organizations.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Registers OIDC and SAML 2.0 identity providers and manages existing ones (domain
 * verification, edit, delete). The IdP must send people back to `callbackBase`, the auth app.
 */
export function AdminSsoPanel({
  callbackBase,
  providers,
  organizations,
}: {
  callbackBase: string;
  providers: SsoProviderRow[];
  organizations: Org[];
}) {
  const t = useTranslations("sso");
  const ts = useTranslations("sso.saml");
  const tp = useTranslations("sso.panel");
  const router = useRouter();
  const [protocol, setProtocol] = React.useState<"oidc" | "saml">("oidc");
  const [providerId, setProviderId] = React.useState("");
  const [issuer, setIssuer] = React.useState("");
  const [domain, setDomain] = React.useState("");
  const [clientId, setClientId] = React.useState("");
  const [clientSecret, setClientSecret] = React.useState("");
  const [organizationId, setOrganizationId] = React.useState(NO_ORG);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const id = providerId.trim();
      const issuerUrl = issuer.trim();
      const emailDomain = domain.trim().toLowerCase();
      const { error } = await authClient.sso.register({
        providerId: id,
        issuer: issuerUrl,
        domain: emailDomain,
        oidcConfig: { clientId: clientId.trim(), clientSecret },
      });
      if (error) {
        toast.error(String(error.message ?? t("registerError")));
        return;
      }
      // The plugin only lets members attach a provider to an organization; admins attach it here.
      if (organizationId !== NO_ORG) {
        const attached = await updateSsoProvider(id, { issuer: issuerUrl, domain: emailDomain, organizationId });
        if (!attached.ok) toast.error(attached.error);
      }
      toast.success(t("registered"));
      setProviderId("");
      setIssuer("");
      setDomain("");
      setClientId("");
      setClientSecret("");
      setOrganizationId(NO_ORG);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  const callbackUrl = `${callbackBase}/api/auth/sso/callback/${providerId.trim() || "<provider-id>"}`;

  return (
    <div className="grid gap-6 xl:grid-cols-[2fr_3fr]">
      <Card className="h-fit border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>{t("registerTitle")}</CardTitle>
          <CardDescription>{protocol === "saml" ? ts("registerDescription") : t("registerDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={protocol} onValueChange={(v) => setProtocol(v as "oidc" | "saml")}>
            <TabsList aria-label={ts("protocol")}>
              <TabsTrigger value="oidc">OIDC</TabsTrigger>
              <TabsTrigger value="saml">SAML 2.0</TabsTrigger>
            </TabsList>
            <TabsContent value="saml" className="pt-2">
              <SamlRegisterForm authAppUrl={callbackBase} organizations={organizations} organizationSelect={(props) => <OrganizationSelect {...props} />} />
            </TabsContent>
            <TabsContent value="oidc" className="space-y-4 pt-2">
              <form onSubmit={handleRegister}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="sso-provider-id">{t("providerId")}</FieldLabel>
                    <Input id="sso-provider-id" value={providerId} onChange={(e) => setProviderId(e.target.value)} disabled={submitting} required />
                    <FieldDescription>{t("providerIdHint")}</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="sso-issuer">{t("issuer")}</FieldLabel>
                    <Input id="sso-issuer" type="url" value={issuer} onChange={(e) => setIssuer(e.target.value)} disabled={submitting} required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="sso-domain">{t("domain")}</FieldLabel>
                    <Input id="sso-domain" value={domain} onChange={(e) => setDomain(e.target.value)} disabled={submitting} placeholder="acme.com" required />
                    <FieldDescription>{t("domainHint")}</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="sso-client-id">{t("clientId")}</FieldLabel>
                    <Input id="sso-client-id" value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={submitting} required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="sso-client-secret">{t("clientSecret")}</FieldLabel>
                    <Input id="sso-client-secret" type="password" autoComplete="off" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} disabled={submitting} required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="sso-organization">{t("organization")}</FieldLabel>
                    <OrganizationSelect id="sso-organization" value={organizationId} onChange={setOrganizationId} organizations={organizations} disabled={submitting} />
                  </Field>
                  <Field>
                    <Button type="submit" disabled={submitting}>
                      {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                      {submitting ? t("registering") : t("register")}
                    </Button>
                  </Field>
                </FieldGroup>
              </form>
              <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
                <p className="font-medium text-foreground">{t("callbackTitle")}</p>
                <p className="mt-1 break-all font-mono text-muted-foreground">{callbackUrl}</p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card className="h-fit border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>{t("providersTitle")}</CardTitle>
          <CardDescription>{tp("providersDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {providers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("providersEmpty")}</p>
          ) : (
            <ul className="space-y-3">
              {providers.map((p) => (
                <ProviderItem key={p.providerId} provider={p} organizations={organizations} authAppUrl={callbackBase} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProviderItem({ provider, organizations, authAppUrl }: { provider: SsoProviderRow; organizations: Org[]; authAppUrl: string }) {
  const t = useTranslations("sso");
  const ts = useTranslations("sso.saml");
  const tp = useTranslations("sso.panel");
  const tc = useTranslations("admin.common");
  const format = useFormatter();
  const [dialog, setDialog] = React.useState<"verify" | "edit" | "delete" | "details" | null>(null);
  const { busy, setBusy, run } = useAdminAction(() => setDialog(null));
  const [record, setRecord] = React.useState<{ name: string; value: string } | null>(null);
  const [issuer, setIssuer] = React.useState(provider.issuer);
  const [domain, setDomain] = React.useState(provider.domain);
  const [orgId, setOrgId] = React.useState(provider.organizationId ?? NO_ORG);

  async function openVerify() {
    setDialog("verify");
    const res = await getDomainVerificationRecord(provider.providerId);
    if (res.ok) setRecord({ name: res.name, value: res.value });
    else toast.error(res.error);
  }

  return (
    <li className="rounded-lg border border-border px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            {provider.providerId}
            <Badge variant="outline">{provider.protocol === "saml" ? "SAML" : "OIDC"}</Badge>
            {provider.domainVerified ? (
              <Badge variant="secondary" className="gap-1"><CheckCircle2 className="size-3" aria-hidden />{tp("verified")}</Badge>
            ) : (
              <Badge variant="outline" className="gap-1"><ShieldAlert className="size-3" aria-hidden />{tp("domainNotVerified")}</Badge>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {provider.domain}
            {provider.organizationName ? ` · ${provider.organizationName}` : ""}
          </p>
          <p className="break-all font-mono text-xs text-muted-foreground">{provider.saml ? provider.saml.idpEntityId : provider.issuer}</p>
          {provider.saml?.certificateExpiresAt ? (
            <p className={provider.saml.certificateExpired ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {provider.saml.certificateExpired
                ? ts("certExpired")
                : ts("certExpires", { date: format.dateTime(new Date(provider.saml.certificateExpiresAt), { year: "numeric", month: "numeric", day: "numeric" }) })}
            </p>
          ) : null}
        </div>
        <div className="flex gap-1">
          {provider.domainVerified ? null : (
            <Button type="button" size="sm" variant="outline" onClick={() => void openVerify()}>{tp("verifyDomain")}</Button>
          )}
          {provider.saml ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setDialog("details")}>
              <FileKey2 className="size-4" aria-hidden />
              {ts("spDetails")}
            </Button>
          ) : null}
          <Button type="button" size="icon-sm" variant="ghost" aria-label={tp("editLabel", { id: provider.providerId })} onClick={() => setDialog("edit")}>
            <Pencil className="size-4" aria-hidden />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label={tp("deleteLabel", { id: provider.providerId })} onClick={() => setDialog("delete")}>
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && !busy && setDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          {dialog === "verify" ? (
            <>
              <DialogHeader>
                <DialogTitle>{tp("verifyTitle", { domain: provider.domain })}</DialogTitle>
                <DialogDescription>{tp("verifyDescription")}</DialogDescription>
              </DialogHeader>
              {record ? (
                <div className="space-y-3 text-sm">
                  {[
                    [tp("recordName"), tp("copyRecordName"), record.name],
                    [tp("recordValue"), tp("copyRecordValue"), record.value],
                  ].map(([label, copyLabel, value]) => (
                    <div key={label}>
                      <p className="text-xs font-medium text-muted-foreground">{label}</p>
                      <div className="mt-1 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                        <code className="min-w-0 flex-1 break-all font-mono text-xs">{value}</code>
                        <Button type="button" size="icon-sm" variant="ghost" aria-label={copyLabel} onClick={() => void navigator.clipboard.writeText(value!).then(() => toast.success(tc("copied")))}>
                          <Copy className="size-4" aria-hidden />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">{tp("recordValidity")}</p>
                </div>
              ) : (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              )}
              <DialogActions
                busy={busy}
                onCancel={() => setDialog(null)}
                cancelLabel={tc("close")}
                onConfirm={() => void run(() => checkDomainVerification(provider.providerId), tp("domainVerified"))}
                confirmLabel={tp("checkDns")}
                confirmDisabled={!record}
              />
            </>
          ) : dialog === "details" && provider.saml ? (
            <SamlDetailsDialogBody providerId={provider.providerId} details={provider.saml} authAppUrl={authAppUrl} onClose={() => setDialog(null)} />
          ) : dialog === "edit" && provider.saml ? (
            <SamlEditDialogBody
              providerId={provider.providerId}
              details={provider.saml}
              domain={provider.domain}
              organizationId={provider.organizationId}
              organizations={organizations}
              organizationSelect={(props) => <OrganizationSelect {...props} />}
              onDone={() => setDialog(null)}
              onBusy={setBusy}
            />
          ) : dialog === "edit" ? (
            <>
              <DialogHeader>
                <DialogTitle>{ts("editTitle", { id: provider.providerId })}</DialogTitle>
                <DialogDescription>{tp("editDescription")}</DialogDescription>
              </DialogHeader>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`issuer-${provider.providerId}`}>{t("issuer")}</FieldLabel>
                  <Input id={`issuer-${provider.providerId}`} value={issuer} onChange={(e) => setIssuer(e.target.value)} disabled={busy} />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`domain-${provider.providerId}`}>{t("domain")}</FieldLabel>
                  <Input id={`domain-${provider.providerId}`} value={domain} onChange={(e) => setDomain(e.target.value)} disabled={busy} />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`org-${provider.providerId}`}>{tp("organization")}</FieldLabel>
                  <OrganizationSelect id={`org-${provider.providerId}`} value={orgId} onChange={setOrgId} organizations={organizations} disabled={busy} />
                </Field>
              </FieldGroup>
              <DialogActions
                busy={busy}
                onCancel={() => setDialog(null)}
                onConfirm={() => void run(() => updateSsoProvider(provider.providerId, { issuer, domain, organizationId: orgId === NO_ORG ? null : orgId }), ts("updated"))}
                confirmLabel={tc("save")}
              />
            </>
          ) : dialog === "delete" ? (
            <>
              <DialogHeader>
                <DialogTitle>{tp("deleteTitle", { id: provider.providerId })}</DialogTitle>
                <DialogDescription>{tp("deleteDescription", { domain: provider.domain })}</DialogDescription>
              </DialogHeader>
              <DialogActions
                busy={busy}
                onCancel={() => setDialog(null)}
                onConfirm={() => void run(() => deleteSsoProvider(provider.providerId), tp("providerDeleted"))}
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
