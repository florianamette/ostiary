"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@ostiary/core/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@ostiary/core/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@ostiary/core/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@ostiary/core/components/ui/field";
import { Textarea } from "@ostiary/core/components/ui/textarea";
import { COUNTRY_MODES, type CountryMode, type CountryPolicy } from "@ostiary/core/lib/country-policy-options";

import { updateCountryPolicy } from "@/app/[locale]/(console)/security/actions";
import { RadioField } from "@/components/admin/common/choice-field";
import { DialogActions } from "@/components/admin/common/dialog-actions";
import { useAdminAction } from "@/components/admin/common/use-admin-action";

/** "France (FR), Germany (DE)" in the console's language. */
function useCountryNames() {
  const locale = useLocale();
  return React.useCallback(
    (codes: string[]) => {
      let names: Intl.DisplayNames | null = null;
      try {
        names = new Intl.DisplayNames([locale], { type: "region" });
      } catch {
        names = null;
      }
      return codes.map((code) => `${names?.of(code) ?? code} (${code})`).join(", ");
    },
    [locale],
  );
}

/** Which countries may sign in and sign up (lib/country-policy.ts), with its edit dialog. */
export function CountryPolicyCard({ policy, configured }: { policy: CountryPolicy; configured: boolean }) {
  const t = useTranslations("admin.pages.security.countries");
  const names = useCountryNames();
  const [editing, setEditing] = React.useState(false);
  const rows: [string, string][] = [
    [t("mode"), t(`modes.${policy.mode}`)],
    ...(policy.mode === "any" ? [] : [[t(policy.mode === "allow" ? "allowed" : "blocked"), names(policy.countries) || t("none")] as [string, string]]),
  ];

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription className="max-w-3xl">{t("description")}</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={!configured}>
            {t("edit")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {configured ? null : <p className="text-sm text-muted-foreground">{t("notConfigured")}</p>}
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(([label, value]) => (
            <div key={label} className="min-w-0 space-y-1">
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="font-medium break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
      {editing ? <CountryPolicyDialog policy={policy} onClose={() => setEditing(false)} /> : null}
    </Card>
  );
}

function CountryPolicyDialog({ policy, onClose }: { policy: CountryPolicy; onClose: () => void }) {
  const t = useTranslations("admin.pages.security.countries");
  const { busy, run } = useAdminAction(onClose);
  const [mode, setMode] = React.useState<CountryMode>(policy.mode);
  const [countries, setCountries] = React.useState(policy.countries.join(", "));

  function save(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      const list = mode === "any" ? [] : countries.split(/[\s,;]+/).filter(Boolean);
      const res = await updateCountryPolicy({ mode, countries: list });
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
                {COUNTRY_MODES.map((m) => (
                  <RadioField
                    key={m}
                    id={`countries-${m}`}
                    name="countries-mode"
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
                <FieldLabel htmlFor="countries-list">{t(mode === "allow" ? "allowed" : "blocked")}</FieldLabel>
                <Textarea
                  id="countries-list"
                  rows={3}
                  value={countries}
                  onChange={(e) => setCountries(e.target.value)}
                  disabled={busy}
                  placeholder="FR, DE, US"
                  className="font-mono text-xs"
                />
                <FieldDescription>{t("countriesHint")}</FieldDescription>
              </Field>
            )}
          </FieldGroup>
          <DialogActions busy={busy} onCancel={onClose} cancelLabel={t("cancel")} confirmLabel={t("save")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
