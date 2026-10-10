"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@ostiary/core/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { updateSsoProvider } from "@/app/[locale]/(console)/sso/actions";
import { NO_ORG, OrganizationSelect, type Org } from "@/components/admin/sso/organization-select";

/** Registration form for an OIDC identity provider, with the callback URL to give it. */
export function OidcRegisterForm({ callbackBase, organizations }: { callbackBase: string; organizations: Org[] }) {
  const t = useTranslations("sso");
  const router = useRouter();
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
    <>
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
    </>
  );
}
