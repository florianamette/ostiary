"use client";

import * as React from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@ostiary/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ostiary/core/components/ui/dialog";
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

type Role = "owner" | "admin" | "member";
const ROLES: Role[] = ["owner", "admin", "member"];

/** Runs a server action, reports the result and refreshes the page data. */
function useAction() {
  const t = useTranslations("admin.pages.organizations.controls");
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const run = React.useCallback(
    async (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) => {
      setBusy(true);
      try {
        const result = await fn();
        if (!result.ok) {
          toast.error(result.error);
          return false;
        }
        toast.success(success);
        router.refresh();
        return true;
      } catch {
        toast.error(t("unexpectedError"));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [router, t],
  );
  return { busy, run };
}

export function RenameOrganizationForm({ id, name, slug }: { id: string; name: string; slug: string }) {
  const t = useTranslations("admin.pages.organizations.controls");
  const tc = useTranslations("admin.common");
  const [draftName, setDraftName] = React.useState(name);
  const [draftSlug, setDraftSlug] = React.useState(slug);
  const { busy, run } = useAction();
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
          <Button type="submit" size="sm" disabled={busy || !dirty}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {tc("save")}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function MemberRoleSelect({ orgId, memberId, role }: { orgId: string; memberId: string; role: string }) {
  const t = useTranslations("admin.pages.organizations.controls");
  const { busy, run } = useAction();
  return (
    <Select
      value={ROLES.includes(role as Role) ? role : "member"}
      disabled={busy}
      onValueChange={(next) => void run(() => updateMemberRole(orgId, memberId, next as Role), t("roleUpdated"))}
    >
      <SelectTrigger size="sm" className="w-28" aria-label={t("role")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {t(`roles.${r}`)}
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
  const tc = useTranslations("admin.common");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  return (
    <>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={label} onClick={() => setOpen(true)}>
        <Trash2 className="size-4" aria-hidden />
      </Button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{body}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const ok = await onConfirm();
                setBusy(false);
                if (ok) setOpen(false);
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RemoveMemberButton({ orgId, memberId, email }: { orgId: string; memberId: string; email: string }) {
  const t = useTranslations("admin.pages.organizations.controls");
  const tc = useTranslations("admin.common");
  const { run } = useAction();
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
  const { run } = useAction();
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

export function InviteMemberForm({ orgId }: { orgId: string }) {
  const t = useTranslations("admin.pages.organizations.controls");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("member");
  const { busy, run } = useAction();
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
          {ROLES.map((r) => (
            <SelectItem key={r} value={r}>
              {t(`roles.${r}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" disabled={busy || !email.trim()}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {t("sendInvitation")}
      </Button>
    </form>
  );
}
