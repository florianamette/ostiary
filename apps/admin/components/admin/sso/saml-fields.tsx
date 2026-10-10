"use client";

import { useTranslations } from "next-intl";

import { Field, FieldDescription, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { Label } from "@ostiary/core/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ostiary/core/components/ui/select";
import { Textarea } from "@ostiary/core/components/ui/textarea";
import {
  SAML_PRESET_MAPPINGS,
  SAML_PRESETS,
  type SamlMapping,
  type SamlPreset,
} from "@ostiary/core/lib/saml-presets";
import type { SamlIdpFormInput } from "@/app/[locale]/(console)/sso/saml-actions";

export type IdpSource = "url" | "xml" | "manual";
type IdpValues = { url: string; xml: string; entityId: string; ssoUrl: string; certificate: string };

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

export function IdpFields({
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
  values: IdpValues;
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

export function MappingFields({
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

export function SignedAssertionsField({ id, checked, onChange, disabled }: { id: string; checked: boolean; onChange: (v: boolean) => void; disabled: boolean }) {
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

export function idpInputFrom(source: IdpSource, v: IdpValues): SamlIdpFormInput {
  if (source === "url") return { source: "url", url: v.url.trim() };
  if (source === "xml") return { source: "xml", xml: v.xml };
  return { source: "manual", entityId: v.entityId, ssoUrl: v.ssoUrl, certificate: v.certificate };
}

export const EMPTY_IDP: IdpValues = { url: "", xml: "", entityId: "", ssoUrl: "", certificate: "" };
