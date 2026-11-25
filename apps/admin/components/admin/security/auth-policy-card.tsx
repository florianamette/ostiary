"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Button } from "@ostiary/core/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@ostiary/core/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@ostiary/core/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@ostiary/core/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ostiary/core/components/ui/select";
import { MIN_PASSWORD_LENGTHS, SESSION_DAYS, TWO_FACTOR_GRACE_DAYS, type AuthPolicy } from "@ostiary/core/lib/auth-policy-options";

import { updateAuthPolicy } from "@/app/[locale]/(console)/security/actions";
import { CheckboxField } from "@/components/admin/common/choice-field";
import { DialogActions } from "@/components/admin/common/dialog-actions";
import { useAdminAction } from "@/components/admin/common/use-admin-action";

/** The session and password policy (lib/auth-policy.ts), with its edit dialog. */
export function AuthPolicyCard({ policy }: { policy: AuthPolicy }) {
  const t = useTranslations("admin.pages.security.policy");
  const [editing, setEditing] = React.useState(false);
  const yesNo = (value: boolean) => (value ? t("on") : t("off"));
  const rows: [string, string][] = [
    [t("sessionDays"), t("days", { count: policy.sessionDays })],
    [t("extendSessions"), yesNo(policy.extendSessions)],
    [t("signOutOnPasswordChange"), yesNo(policy.signOutOnPasswordChange)],
    [t("minPasswordLength"), t("characters", { count: policy.minPasswordLength })],
    [t("passwordSignUp"), yesNo(policy.passwordSignUp)],
    [t("twoFactorEveryone"), yesNo(policy.twoFactorEveryone)],
    [t("twoFactorGraceDays"), t("days", { count: policy.twoFactorGraceDays })],
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
            <div key={label} className="space-y-1">
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
      {editing ? <AuthPolicyDialog policy={policy} onClose={() => setEditing(false)} /> : null}
    </Card>
  );
}

function SwitchField(props: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}) {
  return (
    <Field>
      <CheckboxField {...props} />
    </Field>
  );
}

function AuthPolicyDialog({ policy, onClose }: { policy: AuthPolicy; onClose: () => void }) {
  const t = useTranslations("admin.pages.security.policy");
  const { busy, run } = useAdminAction(onClose);
  const [draft, setDraft] = React.useState<AuthPolicy>(policy);
  const set = <K extends keyof AuthPolicy>(key: K, value: AuthPolicy[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function save(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      // The server sets when "everyone" started.
      const policy: Partial<AuthPolicy> = { ...draft };
      delete policy.twoFactorRequiredSince;
      const res = await updateAuthPolicy(policy as Omit<AuthPolicy, "twoFactorRequiredSince">);
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
            <Field>
              <FieldLabel htmlFor="policy-session-days">{t("sessionDays")}</FieldLabel>
              <Select value={String(draft.sessionDays)} onValueChange={(v) => set("sessionDays", Number(v))} disabled={busy}>
                <SelectTrigger id="policy-session-days" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SESSION_DAYS.map((days) => (
                    <SelectItem key={days} value={String(days)}>
                      {t("days", { count: days })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>{t("sessionDaysHint")}</FieldDescription>
            </Field>
            <SwitchField
              id="policy-extend-sessions"
              label={t("extendSessions")}
              hint={t("extendSessionsHint", { count: draft.sessionDays })}
              checked={draft.extendSessions}
              onChange={(v) => set("extendSessions", v)}
              disabled={busy}
            />
            <SwitchField
              id="policy-sign-out"
              label={t("signOutOnPasswordChange")}
              hint={t("signOutOnPasswordChangeHint")}
              checked={draft.signOutOnPasswordChange}
              onChange={(v) => set("signOutOnPasswordChange", v)}
              disabled={busy}
            />
            <Field>
              <FieldLabel htmlFor="policy-min-length">{t("minPasswordLength")}</FieldLabel>
              <Select value={String(draft.minPasswordLength)} onValueChange={(v) => set("minPasswordLength", Number(v))} disabled={busy}>
                <SelectTrigger id="policy-min-length" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MIN_PASSWORD_LENGTHS.map((length) => (
                    <SelectItem key={length} value={String(length)}>
                      {t("characters", { count: length })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>{t("minPasswordLengthHint")}</FieldDescription>
            </Field>
            <SwitchField
              id="policy-password-sign-up"
              label={t("passwordSignUp")}
              hint={t("passwordSignUpHint")}
              checked={draft.passwordSignUp}
              onChange={(v) => set("passwordSignUp", v)}
              disabled={busy}
            />
            <SwitchField
              id="policy-two-factor"
              label={t("twoFactorEveryone")}
              hint={t("twoFactorEveryoneHint")}
              checked={draft.twoFactorEveryone}
              onChange={(v) => set("twoFactorEveryone", v)}
              disabled={busy}
            />
            <Field>
              <FieldLabel htmlFor="policy-two-factor-grace">{t("twoFactorGraceDays")}</FieldLabel>
              <Select value={String(draft.twoFactorGraceDays)} onValueChange={(v) => set("twoFactorGraceDays", Number(v))} disabled={busy}>
                <SelectTrigger id="policy-two-factor-grace" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TWO_FACTOR_GRACE_DAYS.map((days) => (
                    <SelectItem key={days} value={String(days)}>
                      {days === 0 ? t("noGrace") : t("days", { count: days })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>{t("twoFactorGraceDaysHint")}</FieldDescription>
            </Field>
          </FieldGroup>
          <DialogActions busy={busy} onCancel={onClose} cancelLabel={t("cancel")} confirmLabel={t("save")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
