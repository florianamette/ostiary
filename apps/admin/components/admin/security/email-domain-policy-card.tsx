"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Button } from "@ostiary/core/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@ostiary/core/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@ostiary/core/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@ostiary/core/components/ui/field";
import { Textarea } from "@ostiary/core/components/ui/textarea";
import { EMAIL_DOMAIN_MODES, type EmailDomainMode, type EmailDomainPolicy } from "@ostiary/core/lib/email-domain-policy-options";

import { updateEmailDomainPolicy } from "@/app/[locale]/(console)/security/actions";
import { CheckboxField, RadioField } from "@/components/admin/common/choice-field";
import { DialogActions } from "@/components/admin/common/dialog-actions";
import { useAdminAction } from "@/components/admin/common/use-admin-action";

/** Which email domains may create an account (lib/email-domain-policy.ts), with its edit dialog. */
export function EmailDomainPolicyCard({ policy }: { policy: EmailDomainPolicy }) {
  const t = useTranslations("admin.pages.security.emailDomains");
  const [editing, setEditing] = React.useState(false);
  const rows: [string, string][] = [
    [t("mode"), t(`modes.${policy.mode}`)],
    ...(policy.mode === "any" ? [] : [[t(policy.mode === "allow" ? "allowed" : "blocked"), policy.domains.join(", ") || t("none")] as [string, string]]),
    ...(policy.mode === "allow" ? [] : [[t("blockDisposable"), policy.blockDisposable ? t("on") : t("off")] as [string, string]]),
  ];

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription className="max-w-3xl">{t("description")}</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            {t("edit")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(([label, value]) => (
            <div key={label} className="min-w-0 space-y-1">
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="font-medium break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
      {editing ? <EmailDomainPolicyDialog policy={policy} onClose={() => setEditing(false)} /> : null}
    </Card>
  );
}

function EmailDomainPolicyDialog({ policy, onClose }: { policy: EmailDomainPolicy; onClose: () => void }) {
  const t = useTranslations("admin.pages.security.emailDomains");
  const { busy, run } = useAdminAction(onClose);
  const [mode, setMode] = React.useState<EmailDomainMode>(policy.mode);
  const [domains, setDomains] = React.useState(policy.domains.join("\n"));
  const [blockDisposable, setBlockDisposable] = React.useState(policy.blockDisposable);

  function save(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      const list = mode === "any" ? [] : domains.split(/[\s,;]+/).filter(Boolean);
      const res = await updateEmailDomainPolicy({ mode, domains: list, blockDisposable });
      return res.ok ? res : { ok: false, error: t(`errors.${res.error}`) };
    }, t("saved"));
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={save} className="grid gap-6">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("dialogDescription")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <FieldSet>
              <FieldLegend variant="label">{t("mode")}</FieldLegend>
              <div className="grid gap-2">
                {EMAIL_DOMAIN_MODES.map((m) => (
                  <RadioField
                    key={m}
                    id={`email-domains-${m}`}
                    name="email-domains-mode"
                    checked={mode === m}
                    onChange={() => setMode(m)}
                    disabled={busy}
                    label={t(`modes.${m}`)}
                    hint={t(`modeHints.${m}`)}
                  />
                ))}
              </div>
            </FieldSet>
            {mode === "any" ? null : (
              <Field>
                <FieldLabel htmlFor="email-domains-list">{t(mode === "allow" ? "allowed" : "blocked")}</FieldLabel>
                <Textarea
                  id="email-domains-list"
                  rows={5}
                  value={domains}
                  onChange={(e) => setDomains(e.target.value)}
                  disabled={busy}
                  placeholder={"example.com\nexample.org"}
                  className="font-mono text-xs"
                />
                <FieldDescription>{t("domainsHint")}</FieldDescription>
              </Field>
            )}
            {mode === "allow" ? null : (
              <Field>
                <CheckboxField
                  id="email-domains-disposable"
                  checked={blockDisposable}
                  onChange={setBlockDisposable}
                  disabled={busy}
                  label={t("blockDisposable")}
                  hint={t("blockDisposableHint")}
                />
              </Field>
            )}
          </FieldGroup>
          <DialogActions busy={busy} onCancel={onClose} cancelLabel={t("cancel")} confirmLabel={t("save")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
