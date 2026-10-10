"use client";

import * as React from "react";
import { ChevronDown, Copy, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@ostiary/core/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@ostiary/core/components/ui/collapsible";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@ostiary/core/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { Label } from "@ostiary/core/components/ui/label";
import {
  SAML_PRESET_MAPPINGS,
  samlServiceProviderUrls,
  type SamlMapping,
  type SamlServiceProviderUrls,
} from "@ostiary/core/lib/saml-presets";
import type { SamlProviderSummary } from "@ostiary/core/lib/saml";
import { registerSamlProvider, updateSamlProvider } from "@/app/[locale]/(console)/sso/saml-actions";
import { DialogActions } from "@/components/admin/common/dialog-actions";
import { NO_ORG, OrganizationSelect, type Org } from "@/components/admin/sso/organization-select";
import {
  EMPTY_IDP,
  IdpFields,
  idpInputFrom,
  MappingFields,
  SignedAssertionsField,
  type IdpSource,
} from "@/components/admin/sso/saml-fields";

export type SamlProviderDetails = SamlProviderSummary & { sp: SamlServiceProviderUrls };

export function CopyValue({ label, value }: { label: string; value: string }) {
  const t = useTranslations("sso.saml");
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
        <code className="min-w-0 flex-1 break-all font-mono text-xs">{value}</code>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t("copyLabel", { label })}
          onClick={() => void navigator.clipboard.writeText(value).then(() => toast.success(t("copied")))}
        >
          <Copy className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

/** ACS URL, SP entity ID and SP metadata URL, to paste into the identity provider. */
export function SamlServiceProviderValues({ sp }: { sp: SamlServiceProviderUrls }) {
  const t = useTranslations("sso.saml");
  return (
    <div className="space-y-3">
      <CopyValue label={t("acsUrl")} value={sp.acsUrl} />
      <CopyValue label={t("spEntityId")} value={sp.entityId} />
      <CopyValue label={t("spMetadataUrl")} value={sp.metadataUrl} />
    </div>
  );
}

function SetupSection({ title, steps }: { title: string; steps: string[] }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md px-1 py-1.5 text-left text-sm font-medium hover:bg-muted/50">
        {title}
        <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="ml-5 list-decimal space-y-1 py-2 text-xs text-muted-foreground">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Short Okta and Entra ID instructions. */
export function SamlSetupNotes({ ssoPageUrl }: { ssoPageUrl: string }) {
  const t = useTranslations("sso.saml");
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-foreground">{t("setupTitle")}</p>
      <SetupSection title="Okta" steps={[t("oktaStep1"), t("oktaStep2"), t("oktaStep3"), t("oktaStep4")]} />
      <SetupSection title="Microsoft Entra ID" steps={[t("entraStep1"), t("entraStep2"), t("entraStep3"), t("entraStep4")]} />
      <p className="pt-1 text-xs text-muted-foreground">{t("spInitiatedNote", { url: ssoPageUrl })}</p>
    </div>
  );
}

/** Registration form for a SAML 2.0 identity provider. */
export function SamlRegisterForm({
  authAppUrl,
  organizations,
}: {
  authAppUrl: string;
  organizations: Org[];
}) {
  const t = useTranslations("sso");
  const ts = useTranslations("sso.saml");
  const router = useRouter();
  const [providerId, setProviderId] = React.useState("");
  const [domain, setDomain] = React.useState("");
  const [organizationId, setOrganizationId] = React.useState(NO_ORG);
  const [source, setSource] = React.useState<IdpSource>("url");
  const [idp, setIdp] = React.useState(EMPTY_IDP);
  const [mapping, setMapping] = React.useState<SamlMapping>({ ...SAML_PRESET_MAPPINGS.okta });
  const [wantAssertionsSigned, setWantAssertionsSigned] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await registerSamlProvider({
        providerId,
        domain,
        organizationId: organizationId === NO_ORG ? null : organizationId,
        idp: idpInputFrom(source, idp),
        mapping,
        wantAssertionsSigned,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(t("registered"));
      setProviderId("");
      setDomain("");
      setOrganizationId(NO_ORG);
      setIdp(EMPTY_IDP);
      router.refresh();
    } catch {
      toast.error(t("registerError"));
    } finally {
      setSubmitting(false);
    }
  }

  const sp = samlServiceProviderUrls(authAppUrl, providerId.trim() || "your-provider-id");

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="saml-provider-id">{t("providerId")}</FieldLabel>
            <Input id="saml-provider-id" value={providerId} onChange={(e) => setProviderId(e.target.value.toLowerCase())} disabled={submitting} required pattern="[a-z0-9][a-z0-9_\-]{1,62}" />
            <FieldDescription>{t("providerIdHint")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="saml-domain">{t("domain")}</FieldLabel>
            <Input id="saml-domain" value={domain} onChange={(e) => setDomain(e.target.value)} disabled={submitting} placeholder="acme.com" required />
            <FieldDescription>{t("domainHint")}</FieldDescription>
          </Field>
          <IdpFields idPrefix="saml" source={source} onSource={setSource} values={idp} onChange={(f, v) => setIdp((cur) => ({ ...cur, [f]: v }))} disabled={submitting} required />
          <MappingFields idPrefix="saml-map" mapping={mapping} onMapping={setMapping} disabled={submitting} />
          <SignedAssertionsField id="saml-want-signed" checked={wantAssertionsSigned} onChange={setWantAssertionsSigned} disabled={submitting} />
          <Field>
            <FieldLabel htmlFor="saml-organization">{t("organization")}</FieldLabel>
            <OrganizationSelect id="saml-organization" value={organizationId} onChange={setOrganizationId} organizations={organizations} disabled={submitting} />
          </Field>
          <Field>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {submitting ? t("registering") : t("register")}
            </Button>
          </Field>
        </FieldGroup>
      </form>
      <div className="space-y-3 rounded-md border border-border bg-muted/40 p-3">
        <p className="text-xs font-medium text-foreground">{ts("spTitle")}</p>
        <SamlServiceProviderValues sp={sp} />
      </div>
      <SamlSetupNotes ssoPageUrl={`${authAppUrl}/sso`} />
    </div>
  );
}

/** Dialog body: the SP values and setup notes of an existing SAML provider. */
export function SamlDetailsDialogBody({ providerId, details, authAppUrl, onClose }: { providerId: string; details: SamlProviderDetails; authAppUrl: string; onClose: () => void }) {
  const ts = useTranslations("sso.saml");
  return (
    <>
      <DialogHeader>
        <DialogTitle>{ts("detailsTitle", { id: providerId })}</DialogTitle>
        <DialogDescription>{ts("detailsDescription")}</DialogDescription>
      </DialogHeader>
      <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        <SamlServiceProviderValues sp={details.sp} />
        <div className="space-y-1 text-xs text-muted-foreground">
          {details.idpEntityId ? <p>{ts("idpEntityId")}: <span className="break-all font-mono">{details.idpEntityId}</span></p> : null}
          {details.ssoUrl ? <p>{ts("ssoUrl")}: <span className="break-all font-mono">{details.ssoUrl}</span></p> : null}
          <p>{details.wantAssertionsSigned ? ts("assertionsSignedOn") : ts("assertionsSignedOff")}</p>
        </div>
        <SamlSetupNotes ssoPageUrl={`${authAppUrl}/sso`} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>{ts("close")}</Button>
      </DialogFooter>
    </>
  );
}

/** Dialog body: edit a SAML provider (domain, organization, mapping, options, IdP). */
export function SamlEditDialogBody({
  providerId,
  details,
  domain: initialDomain,
  organizationId: initialOrg,
  organizations,
  onDone,
  onBusy,
}: {
  providerId: string;
  details: SamlProviderDetails;
  domain: string;
  organizationId: string | null;
  organizations: Org[];
  onDone: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const t = useTranslations("sso");
  const ts = useTranslations("sso.saml");
  const router = useRouter();
  const [domain, setDomain] = React.useState(initialDomain);
  const [orgId, setOrgId] = React.useState(initialOrg ?? NO_ORG);
  const [mapping, setMapping] = React.useState<SamlMapping>(details.mapping ?? { ...SAML_PRESET_MAPPINGS.okta });
  const [wantAssertionsSigned, setWantAssertionsSigned] = React.useState(details.wantAssertionsSigned);
  const [replaceIdp, setReplaceIdp] = React.useState(false);
  const [source, setSource] = React.useState<IdpSource>("url");
  const [idp, setIdp] = React.useState(EMPTY_IDP);
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    onBusy(true);
    try {
      const res = await updateSamlProvider(providerId, {
        domain,
        organizationId: orgId === NO_ORG ? null : orgId,
        mapping,
        wantAssertionsSigned,
        idp: replaceIdp ? idpInputFrom(source, idp) : null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(ts("updated"));
      onDone();
      router.refresh();
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{ts("editTitle", { id: providerId })}</DialogTitle>
        <DialogDescription>{ts("editDescription")}</DialogDescription>
      </DialogHeader>
      <div className="max-h-[60vh] overflow-y-auto pr-1">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`saml-edit-domain-${providerId}`}>{t("domain")}</FieldLabel>
            <Input id={`saml-edit-domain-${providerId}`} value={domain} onChange={(e) => setDomain(e.target.value)} disabled={busy} />
          </Field>
          <Field>
            <FieldLabel htmlFor={`saml-edit-org-${providerId}`}>{t("organization")}</FieldLabel>
            <OrganizationSelect id={`saml-edit-org-${providerId}`} value={orgId} onChange={setOrgId} organizations={organizations} disabled={busy} />
          </Field>
          <MappingFields idPrefix={`saml-edit-map-${providerId}`} mapping={mapping} onMapping={setMapping} disabled={busy} />
          <SignedAssertionsField id={`saml-edit-signed-${providerId}`} checked={wantAssertionsSigned} onChange={setWantAssertionsSigned} disabled={busy} />
          <Field>
            <div className="flex items-center gap-3">
              <input id={`saml-edit-replace-${providerId}`} type="checkbox" className="size-4 rounded border-input" checked={replaceIdp} onChange={(e) => setReplaceIdp(e.target.checked)} disabled={busy} />
              <Label htmlFor={`saml-edit-replace-${providerId}`} className="cursor-pointer">{ts("replaceIdp")}</Label>
            </div>
          </Field>
          {replaceIdp ? (
            <IdpFields idPrefix={`saml-edit-${providerId}`} source={source} onSource={setSource} values={idp} onChange={(f, v) => setIdp((cur) => ({ ...cur, [f]: v }))} disabled={busy} required />
          ) : null}
        </FieldGroup>
      </div>
      <DialogActions busy={busy} onCancel={onDone} cancelLabel={ts("cancel")} onConfirm={() => void save()} confirmLabel={ts("save")} />
    </>
  );
}
