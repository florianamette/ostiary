"use client";

import * as React from "react";
import { CheckCircle2, Copy, FileKey2, Loader2, Pencil, ShieldAlert, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@ostiary/core/components/ui/badge";
import { Button } from "@ostiary/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ostiary/core/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { DialogActions } from "@/components/admin/common/dialog-actions";
import { useAdminAction } from "@/components/admin/common/use-admin-action";
import {
  SamlDetailsDialogBody,
  SamlEditDialogBody,
  type SamlProviderDetails,
} from "@/components/admin/sso/admin-saml";
import { NO_ORG, OrganizationSelect, type Org } from "@/components/admin/sso/organization-select";
import {
  checkDomainVerification,
  deleteSsoProvider,
  getDomainVerificationRecord,
  updateSsoProvider,
} from "@/app/[locale]/(console)/sso/actions";

export type SsoProviderRow = {
  providerId: string;
  issuer: string;
  domain: string;
  domainVerified: boolean;
  organizationId: string | null;
  organizationName: string | null;
  protocol: "oidc" | "saml";
  saml: SamlProviderDetails | null;
};

/** One registered provider, with its domain verification, edit and delete dialogs. */
export function ProviderItem({ provider, organizations, authAppUrl }: { provider: SsoProviderRow; organizations: Org[]; authAppUrl: string }) {
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
