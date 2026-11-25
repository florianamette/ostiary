"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@ostiary/core/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ostiary/core/components/ui/select";
import {
  cancelInvitation,
  inviteMember,
  removeMember,
  renameOrganization,
  updateMemberRole,
} from "@/app/[locale]/(console)/organizations/[id]/actions";
import { ConfirmRemoveDialog } from "@/components/admin/common/confirm-remove-dialog";
import { useAdminAction } from "@/components/admin/common/use-admin-action";

/** A built-in role (translated) or one of the organization's own (shown by its name). */
type Role = string;
const ROLES = ["owner", "admin", "member"] as const;

export function RenameOrganizationForm({ id, name, slug }: { id: string; name: string; slug: string }) {
  const t = useTranslations("admin.pages.organizations.controls");
  const tc = useTranslations("admin.common");
  const [draftName, setDraftName] = React.useState(name);
  const [draftSlug, setDraftSlug] = React.useState(slug);
  const { busy, run } = useAdminAction();
  const dirty = draftName.trim() !== name || draftSlug.trim() !== slug;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => renameOrganization(id, draftName, draftSlug), t("organizationUpdated"));
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="org-name">{tc("name")}</FieldLabel>
          <Input id="org-name" value={draftName} onChange={(e) => setDraftName(e.target.value)} disabled={busy} />
        </Field>
        <Field>
          <FieldLabel htmlFor="org-slug">{t("slug")}</FieldLabel>
          <Input id="org-slug" value={draftSlug} onChange={(e) => setDraftSlug(e.target.value)} disabled={busy} autoComplete="off" />
        </Field>
        <div>
          <Button type="submit" size="sm" loading={busy} disabled={!dirty}>
            {tc("save")}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function roleOptions(customRoles: readonly string[], current?: string): string[] {
  const all = [...ROLES, ...customRoles];
  return current && !all.includes(current) ? [...all, current] : all;
}

export function MemberRoleSelect({ orgId, memberId, role, customRoles = [] }: { orgId: string; memberId: string; role: string; customRoles?: string[] }) {
  const t = useTranslations("admin.pages.organizations.controls");
  const { busy, run } = useAdminAction();
  const label = (r: string) => ((ROLES as readonly string[]).includes(r) ? t(`roles.${r}`) : r);
  return (
    <Select
      value={role}
      disabled={busy}
      onValueChange={(next) => void run(() => updateMemberRole(orgId, memberId, next as Role), t("roleUpdated"))}
    >
      <SelectTrigger size="sm" className="w-32" aria-label={t("role")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roleOptions(customRoles, role).map((r) => (
          <SelectItem key={r} value={r}>
            {label(r)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Icon button that asks for confirmation, then runs the action. */
function ConfirmButton({
  label,
  title,
  body,
  confirmLabel,
  onConfirm,
}: {
  label: string;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => Promise<boolean>;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function confirm() {
    setBusy(true);
    const ok = await onConfirm();
    setBusy(false);
    if (ok) setOpen(false);
  }

  return (
    <>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={label} onClick={() => setOpen(true)}>
        <Trash2 className="size-4" aria-hidden />
      </Button>
      <ConfirmRemoveDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={body}
        pending={busy}
        onConfirm={() => void confirm()}
        confirmLabel={confirmLabel}
      />
    </>
  );
}

export function RemoveMemberButton({ orgId, memberId, email }: { orgId: string; memberId: string; email: string }) {
  const t = useTranslations("admin.pages.organizations.controls");
  const tc = useTranslations("admin.common");
  const { run } = useAdminAction();
  return (
    <ConfirmButton
      label={t("removeMemberLabel", { email })}
      title={t("removeMemberTitle", { email })}
      body={t("removeMemberBody")}
      confirmLabel={tc("remove")}
      onConfirm={() => run(() => removeMember(orgId, memberId), t("memberRemoved"))}
    />
  );
}

export function CancelInvitationButton({ orgId, invitationId, email }: { orgId: string; invitationId: string; email: string }) {
  const t = useTranslations("admin.pages.organizations.controls");
  const { run } = useAdminAction();
  return (
    <ConfirmButton
      label={t("cancelInvitationLabel", { email })}
      title={t("cancelInvitationTitle", { email })}
      body={t("cancelInvitationBody")}
      confirmLabel={t("cancelInvitation")}
      onConfirm={() => run(() => cancelInvitation(orgId, invitationId), t("invitationCancelled"))}
    />
  );
}

export function InviteMemberForm({ orgId, customRoles = [] }: { orgId: string; customRoles?: string[] }) {
  const t = useTranslations("admin.pages.organizations.controls");
  const label = (r: string) => ((ROLES as readonly string[]).includes(r) ? t(`roles.${r}`) : r);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("member");
  const { busy, run } = useAdminAction();
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run(() => inviteMember(orgId, email, role), t("invitationSent"))) setEmail("");
      }}
    >
      <Field className="flex-1">
        <FieldLabel htmlFor="invite-email">{t("inviteByEmail")}</FieldLabel>
        <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} required />
      </Field>
      <Select value={role} onValueChange={(v) => setRole(v as Role)} disabled={busy}>
        <SelectTrigger className="w-full sm:w-32" aria-label={t("role")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {roleOptions(customRoles).map((r) => (
            <SelectItem key={r} value={r}>
              {label(r)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" loading={busy} disabled={!email.trim()}>
        {t("sendInvitation")}
      </Button>
    </form>
  );
}
