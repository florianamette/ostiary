"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Button } from "@ostiary/core/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@ostiary/core/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@ostiary/core/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@ostiary/core/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ostiary/core/components/ui/select";
import {
  INACTIVE_ACTIONS,
  INACTIVE_DAYS,
  INACTIVE_WARNING_DAYS,
  LOCKOUT_ATTEMPTS,
  LOCKOUT_MINUTES,
  MIN_PASSWORD_LENGTHS,
  SESSION_DAYS,
  TWO_FACTOR_GRACE_DAYS,
  type AuthPolicy,
  type AuthPolicyInput,
} from "@ostiary/core/lib/auth-policy-options";

import { updateAuthPolicy } from "@/app/[locale]/(console)/security/actions";
import { CheckboxField } from "@/components/admin/common/choice-field";
import { DialogActions } from "@/components/admin/common/dialog-actions";
import { useAdminAction } from "@/components/admin/common/use-admin-action";

/*
 * The session and password policy (lib/auth-policy.ts), in groups: each card shows its settings
 * and edits only those, saving them over the rest of the policy.
 */

type Translate = ReturnType<typeof useTranslations<"admin.pages.security.policy">>;
type SetField = <K extends keyof AuthPolicy>(key: K, value: AuthPolicy[K]) => void;
type FieldsProps = { draft: AuthPolicy; set: SetField; busy: boolean; t: Translate };

type Group = {
  id: "sessions" | "passwords" | "twoFactor" | "emails" | "inactive";
  /** The policy fields this group edits, the only ones its dialog saves. */
  keys: (keyof AuthPolicyInput)[];
  rows: (policy: AuthPolicy, t: Translate) => [string, string][];
  Fields: (props: FieldsProps) => React.ReactNode;
};

const yesNo = (t: Translate, value: boolean) => (value ? t("on") : t("off"));

function SwitchField(props: { id: string; label: string; hint: string; checked: boolean; onChange: (value: boolean) => void; disabled: boolean }) {
  return (
    <Field>
      <CheckboxField {...props} />
    </Field>
  );
}

function SelectField<V extends string | number>(props: {
  id: string;
  label: string;
  hint: string;
  value: V;
  choices: readonly V[];
  choiceLabel: (value: V) => string;
  onChange: (value: V) => void;
  disabled: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
      <Select
        value={String(props.value)}
        onValueChange={(v) => props.onChange((typeof props.value === "number" ? Number(v) : v) as V)}
        disabled={props.disabled}
      >
        <SelectTrigger id={props.id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {props.choices.map((choice) => (
            <SelectItem key={String(choice)} value={String(choice)}>
              {props.choiceLabel(choice)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>{props.hint}</FieldDescription>
    </Field>
  );
}

const GROUPS: Group[] = [
  {
    id: "sessions",
    keys: ["sessionDays", "extendSessions", "signOutOnPasswordChange"],
    rows: (p, t) => [
      [t("sessionDays"), t("days", { count: p.sessionDays })],
      [t("extendSessions"), yesNo(t, p.extendSessions)],
      [t("signOutOnPasswordChange"), yesNo(t, p.signOutOnPasswordChange)],
    ],
    Fields: ({ draft, set, busy, t }) => (
      <>
        <SelectField
          id="policy-session-days"
          label={t("sessionDays")}
          hint={t("sessionDaysHint")}
          value={draft.sessionDays}
          choices={SESSION_DAYS}
          choiceLabel={(days) => t("days", { count: days })}
          onChange={(v) => set("sessionDays", v)}
          disabled={busy}
        />
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
      </>
    ),
  },
  {
    id: "passwords",
    keys: ["minPasswordLength", "passwordSignUp", "lockoutAttempts"],
    rows: (p, t) => [
      [t("minPasswordLength"), t("characters", { count: p.minPasswordLength })],
      [t("passwordSignUp"), yesNo(t, p.passwordSignUp)],
      [t("lockoutAttempts"), p.lockoutAttempts === 0 ? t("lockoutNever") : t("wrongPasswords", { count: p.lockoutAttempts })],
    ],
    Fields: ({ draft, set, busy, t }) => (
      <>
        <SelectField
          id="policy-min-length"
          label={t("minPasswordLength")}
          hint={t("minPasswordLengthHint")}
          value={draft.minPasswordLength}
          choices={MIN_PASSWORD_LENGTHS}
          choiceLabel={(length) => t("characters", { count: length })}
          onChange={(v) => set("minPasswordLength", v)}
          disabled={busy}
        />
        <SwitchField
          id="policy-password-sign-up"
          label={t("passwordSignUp")}
          hint={t("passwordSignUpHint")}
          checked={draft.passwordSignUp}
          onChange={(v) => set("passwordSignUp", v)}
          disabled={busy}
        />
        <SelectField
          id="policy-lockout"
          label={t("lockoutAttempts")}
          hint={t("lockoutAttemptsHint", { minutes: LOCKOUT_MINUTES })}
          value={draft.lockoutAttempts}
          choices={LOCKOUT_ATTEMPTS}
          choiceLabel={(count) => (count === 0 ? t("lockoutNever") : t("wrongPasswords", { count }))}
          onChange={(v) => set("lockoutAttempts", v)}
          disabled={busy}
        />
      </>
    ),
  },
  {
    id: "twoFactor",
    keys: ["twoFactorEveryone", "twoFactorGraceDays"],
    rows: (p, t) => [
      [t("twoFactorEveryone"), yesNo(t, p.twoFactorEveryone)],
      [t("twoFactorGraceDays"), p.twoFactorGraceDays === 0 ? t("noGrace") : t("days", { count: p.twoFactorGraceDays })],
    ],
    Fields: ({ draft, set, busy, t }) => (
      <>
        <SwitchField
          id="policy-two-factor"
          label={t("twoFactorEveryone")}
          hint={t("twoFactorEveryoneHint")}
          checked={draft.twoFactorEveryone}
          onChange={(v) => set("twoFactorEveryone", v)}
          disabled={busy}
        />
        <SelectField
          id="policy-two-factor-grace"
          label={t("twoFactorGraceDays")}
          hint={t("twoFactorGraceDaysHint")}
          value={draft.twoFactorGraceDays}
          choices={TWO_FACTOR_GRACE_DAYS}
          choiceLabel={(days) => (days === 0 ? t("noGrace") : t("days", { count: days }))}
          onChange={(v) => set("twoFactorGraceDays", v)}
          disabled={busy}
        />
      </>
    ),
  },
  {
    id: "emails",
    keys: ["newDeviceEmail", "securityChangeEmail"],
    rows: (p, t) => [
      [t("newDeviceEmail"), yesNo(t, p.newDeviceEmail)],
      [t("securityChangeEmail"), yesNo(t, p.securityChangeEmail)],
    ],
    Fields: ({ draft, set, busy, t }) => (
      <>
        <SwitchField
          id="policy-new-device-email"
          label={t("newDeviceEmail")}
          hint={t("newDeviceEmailHint")}
          checked={draft.newDeviceEmail}
          onChange={(v) => set("newDeviceEmail", v)}
          disabled={busy}
        />
        <SwitchField
          id="policy-security-change-email"
          label={t("securityChangeEmail")}
          hint={t("securityChangeEmailHint")}
          checked={draft.securityChangeEmail}
          onChange={(v) => set("securityChangeEmail", v)}
          disabled={busy}
        />
      </>
    ),
  },
  {
    id: "inactive",
    keys: ["inactiveDays", "inactiveAction"],
    rows: (p, t) => [
      [
        t("inactiveDays"),
        p.inactiveDays === 0
          ? t("inactiveNever")
          : t(p.inactiveAction === "delete" ? "inactiveDeleteAfter" : "inactiveDisableAfter", { count: p.inactiveDays }),
      ],
    ],
    Fields: ({ draft, set, busy, t }) => (
      <>
        <SelectField
          id="policy-inactive-days"
          label={t("inactiveDays")}
          hint={t("inactiveDaysHint", { warning: INACTIVE_WARNING_DAYS })}
          value={draft.inactiveDays}
          choices={INACTIVE_DAYS}
          choiceLabel={(days) => (days === 0 ? t("inactiveNever") : t("days", { count: days }))}
          onChange={(v) => set("inactiveDays", v)}
          disabled={busy}
        />
        {draft.inactiveDays ? (
          <SelectField
            id="policy-inactive-action"
            label={t("inactiveAction")}
            hint={t("inactiveActionHint")}
            value={draft.inactiveAction}
            choices={INACTIVE_ACTIONS}
            choiceLabel={(action) => t(action === "delete" ? "inactiveDelete" : "inactiveDisable")}
            onChange={(v) => set("inactiveAction", v)}
            disabled={busy}
          />
        ) : null}
      </>
    ),
  },
];

/** The policy's groups, one card each (lib/auth-policy.ts). */
export function AuthPolicyCards({ policy }: { policy: AuthPolicy }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {GROUPS.map((group) => (
        <PolicyGroupCard key={group.id} group={group} policy={policy} />
      ))}
    </div>
  );
}

function PolicyGroupCard({ group, policy }: { group: Group; policy: AuthPolicy }) {
  const t = useTranslations("admin.pages.security.policy");
  const [editing, setEditing] = React.useState(false);
  const title = t(`groups.${group.id}.title`);
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{t(`groups.${group.id}.description`)}</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)} aria-label={t("editGroup", { group: title })}>
            {t("edit")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          {group.rows(policy, t).map(([label, value]) => (
            <div key={label} className="space-y-1">
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
      {editing ? <PolicyGroupDialog group={group} title={title} policy={policy} onClose={() => setEditing(false)} /> : null}
    </Card>
  );
}

function PolicyGroupDialog({ group, title, policy, onClose }: { group: Group; title: string; policy: AuthPolicy; onClose: () => void }) {
  const t = useTranslations("admin.pages.security.policy");
  const { busy, run } = useAdminAction(onClose);
  const [draft, setDraft] = React.useState<AuthPolicy>(policy);
  const set: SetField = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const Fields = group.Fields;

  function save(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      // Only this group's fields: the server keeps the rest as stored, and sets the start dates.
      const changes = Object.fromEntries(group.keys.map((key) => [key, draft[key]])) as Partial<AuthPolicyInput>;
      const res = await updateAuthPolicy(changes);
      return res.ok ? res : { ok: false, error: t(`errors.${res.error}`) };
    }, t("saved"));
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={save} className="grid gap-6">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{t(`groups.${group.id}.description`)}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Fields draft={draft} set={set} busy={busy} t={t} />
          </FieldGroup>
          <DialogActions busy={busy} onCancel={onClose} cancelLabel={t("cancel")} confirmLabel={t("save")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
