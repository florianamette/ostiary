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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ostiary/core/components/ui/select";
import { Textarea } from "@ostiary/core/components/ui/textarea";
import {
  SAML_PRESET_MAPPINGS,
  SAML_PRESETS,
  samlServiceProviderUrls,
  type SamlMapping,
  type SamlPreset,
  type SamlServiceProviderUrls,
} from "@ostiary/core/lib/saml-presets";
import type { SamlProviderSummary } from "@ostiary/core/lib/saml";
import {
  registerSamlProvider,
  updateSamlProvider,
  type SamlIdpFormInput,
} from "@/app/[locale]/(console)/sso/saml-actions";

export type SamlProviderDetails = SamlProviderSummary & { sp: SamlServiceProviderUrls };

type Org = { id: string; name: string };
type IdpSource = "url" | "xml" | "manual";

/** The preset whose names match the mapping, or "custom". */
function presetFor(mapping: SamlMapping | null): SamlPreset {
  if (!mapping) return "okta";
  for (const [preset, m] of Object.entries(SAML_PRESET_MAPPINGS)) {
    if (m.email === mapping.email && m.name === mapping.name && (m.firstName ?? "") === (mapping.firstName ?? "") && (m.lastName ?? "") === (mapping.lastName ?? "")) {
      return preset as SamlPreset;
    }
  }
  return "custom";
}

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

function IdpFields({
  idPrefix,
  source,
  onSource,
  values,
  onChange,
  disabled,
  required,
}: {
  idPrefix: string;
  source: IdpSource;
  onSource: (s: IdpSource) => void;
  values: { url: string; xml: string; entityId: string; ssoUrl: string; certificate: string };
  onChange: (field: keyof typeof values, value: string) => void;
  disabled: boolean;
  required: boolean;
}) {
  const t = useTranslations("sso.saml");
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-source`}>{t("idpSource")}</FieldLabel>
        <Select value={source} onValueChange={(v) => onSource(v as IdpSource)} disabled={disabled}>
          <SelectTrigger id={`${idPrefix}-source`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="url">{t("sourceUrl")}</SelectItem>
            <SelectItem value="xml">{t("sourceXml")}</SelectItem>
            <SelectItem value="manual">{t("sourceManual")}</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {source === "url" ? (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-url`}>{t("metadataUrl")}</FieldLabel>
          <Input id={`${idPrefix}-url`} type="url" value={values.url} onChange={(e) => onChange("url", e.target.value)} disabled={disabled} required={required} placeholder="https://idp.example.com/metadata.xml" />
          <FieldDescription>{t("metadataUrlHint")}</FieldDescription>
        </Field>
      ) : source === "xml" ? (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-xml`}>{t("metadataXml")}</FieldLabel>
          <Textarea id={`${idPrefix}-xml`} value={values.xml} onChange={(e) => onChange("xml", e.target.value)} disabled={disabled} required={required} rows={5} className="font-mono text-xs" placeholder="<md:EntityDescriptor …>" />
          <FieldDescription>{t("metadataXmlHint")}</FieldDescription>
        </Field>
      ) : (
        <>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-entity`}>{t("idpEntityId")}</FieldLabel>
            <Input id={`${idPrefix}-entity`} value={values.entityId} onChange={(e) => onChange("entityId", e.target.value)} disabled={disabled} required={required} />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-sso`}>{t("ssoUrl")}</FieldLabel>
            <Input id={`${idPrefix}-sso`} type="url" value={values.ssoUrl} onChange={(e) => onChange("ssoUrl", e.target.value)} disabled={disabled} required={required} />
            <FieldDescription>{t("ssoUrlHint")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-cert`}>{t("certificate")}</FieldLabel>
            <Textarea id={`${idPrefix}-cert`} value={values.certificate} onChange={(e) => onChange("certificate", e.target.value)} disabled={disabled} required={required} rows={4} className="font-mono text-xs" placeholder="-----BEGIN CERTIFICATE-----" />
            <FieldDescription>{t("certificateHint")}</FieldDescription>
          </Field>
        </>
      )}
    </>
  );
}

function MappingFields({
  idPrefix,
  mapping,
  onMapping,
  disabled,
}: {
  idPrefix: string;
  mapping: SamlMapping;
  onMapping: (m: SamlMapping) => void;
  disabled: boolean;
}) {
  const t = useTranslations("sso.saml");
  const preset = presetFor(mapping);
  const fields: Array<[keyof SamlMapping, string, boolean]> = [
    ["email", t("attrEmail"), true],
    ["name", t("attrName"), true],
    ["firstName", t("attrFirstName"), false],
    ["lastName", t("attrLastName"), false],
  ];
  return (
    <div className="space-y-3 rounded-md border border-border/80 p-3">
      <p className="text-sm font-medium">{t("mappingTitle")}</p>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-preset`}>{t("mappingPreset")}</FieldLabel>
        <Select
          value={preset}
          onValueChange={(v) => {
            if (v !== "custom") onMapping({ ...SAML_PRESET_MAPPINGS[v as Exclude<SamlPreset, "custom">] });
          }}
          disabled={disabled}
        >
          <SelectTrigger id={`${idPrefix}-preset`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SAML_PRESETS.map((p) => (
              <SelectItem key={p} value={p}>
                {t(`preset_${p}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {fields.map(([key, label, required]) => (
        <Field key={key}>
          <FieldLabel htmlFor={`${idPrefix}-${key}`}>{label}</FieldLabel>
          <Input
            id={`${idPrefix}-${key}`}
            value={mapping[key] ?? ""}
            onChange={(e) => onMapping({ ...mapping, [key]: e.target.value })}
            disabled={disabled}
            required={required}
            className="font-mono text-xs"
          />
        </Field>
      ))}
      <p className="text-xs text-muted-foreground">{t("mappingHint")}</p>
    </div>
  );
}

function SignedAssertionsField({ id, checked, onChange, disabled }: { id: string; checked: boolean; onChange: (v: boolean) => void; disabled: boolean }) {
  const t = useTranslations("sso.saml");
  return (
    <Field>
      <div className="flex gap-3 rounded-md border border-border/80 bg-muted/30 p-3">
        <input id={id} type="checkbox" className="mt-0.5 size-4 shrink-0 rounded border-input" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
        <div className="grid gap-1">
          <Label htmlFor={id} className="cursor-pointer font-medium leading-none">
            {t("wantAssertionsSigned")}
          </Label>
          <p className="text-xs leading-snug text-muted-foreground">{t("wantAssertionsSignedHint")}</p>
          <p className="text-xs leading-snug text-muted-foreground">{t("requestSigningNote")}</p>
        </div>
      </div>
    </Field>
  );
}

function idpInputFrom(source: IdpSource, v: { url: string; xml: string; entityId: string; ssoUrl: string; certificate: string }): SamlIdpFormInput {
  if (source === "url") return { source: "url", url: v.url.trim() };
  if (source === "xml") return { source: "xml", xml: v.xml };
  return { source: "manual", entityId: v.entityId, ssoUrl: v.ssoUrl, certificate: v.certificate };
}

const EMPTY_IDP = { url: "", xml: "", entityId: "", ssoUrl: "", certificate: "" };

/** Registration form for a SAML 2.0 identity provider. */
export function SamlRegisterForm({
  authAppUrl,
  organizations,
  organizationSelect,
}: {
  authAppUrl: string;
  organizations: Org[];
  organizationSelect: (props: { id: string; value: string; onChange: (v: string) => void; organizations: Org[]; disabled?: boolean }) => React.ReactNode;
}) {
  const t = useTranslations("sso");
  const ts = useTranslations("sso.saml");
  const router = useRouter();
  const [providerId, setProviderId] = React.useState("");
  const [domain, setDomain] = React.useState("");
  const [organizationId, setOrganizationId] = React.useState("__none__");
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
        organizationId: organizationId === "__none__" ? null : organizationId,
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
      setOrganizationId("__none__");
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
            {organizationSelect({ id: "saml-organization", value: organizationId, onChange: setOrganizationId, organizations, disabled: submitting })}
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
  organizationSelect,
  onDone,
  onBusy,
}: {
  providerId: string;
  details: SamlProviderDetails;
  domain: string;
  organizationId: string | null;
  organizations: Org[];
  organizationSelect: (props: { id: string; value: string; onChange: (v: string) => void; organizations: Org[]; disabled?: boolean }) => React.ReactNode;
  onDone: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const t = useTranslations("sso");
  const ts = useTranslations("sso.saml");
  const router = useRouter();
  const [domain, setDomain] = React.useState(initialDomain);
  const [orgId, setOrgId] = React.useState(initialOrg ?? "__none__");
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
        organizationId: orgId === "__none__" ? null : orgId,
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
            {organizationSelect({ id: `saml-edit-org-${providerId}`, value: orgId, onChange: setOrgId, organizations, disabled: busy })}
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
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onDone}>{ts("cancel")}</Button>
        <Button type="button" disabled={busy} onClick={() => void save()}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {ts("save")}
        </Button>
      </DialogFooter>
    </>
  );
}
