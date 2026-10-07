"use client";

import * as React from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
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
        toast.error("Something went wrong.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [router],
  );
  return { busy, run };
}

export function RenameOrganizationForm({ id, name, slug }: { id: string; name: string; slug: string }) {
  const [draftName, setDraftName] = React.useState(name);
  const [draftSlug, setDraftSlug] = React.useState(slug);
  const { busy, run } = useAction();
  const dirty = draftName.trim() !== name || draftSlug.trim() !== slug;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => renameOrganization(id, draftName, draftSlug), "Organization updated");
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="org-name">Name</FieldLabel>
          <Input id="org-name" value={draftName} onChange={(e) => setDraftName(e.target.value)} disabled={busy} />
        </Field>
        <Field>
          <FieldLabel htmlFor="org-slug">Slug</FieldLabel>
          <Input id="org-slug" value={draftSlug} onChange={(e) => setDraftSlug(e.target.value)} disabled={busy} autoComplete="off" />
        </Field>
        <div>
          <Button type="submit" size="sm" disabled={busy || !dirty}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Save
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function MemberRoleSelect({ orgId, memberId, role }: { orgId: string; memberId: string; role: string }) {
  const { busy, run } = useAction();
  return (
    <Select
      value={ROLES.includes(role as Role) ? role : "member"}
      disabled={busy}
      onValueChange={(next) => void run(() => updateMemberRole(orgId, memberId, next as Role), "Role updated")}
    >
      <SelectTrigger size="sm" className="w-28" aria-label="Role">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {r}
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
              Cancel
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
  const { run } = useAction();
  return (
    <ConfirmButton
      label={`Remove ${email}`}
      title={`Remove ${email}?`}
      body="They lose access to this organization. Their account stays."
      confirmLabel="Remove"
      onConfirm={() => run(() => removeMember(orgId, memberId), "Member removed")}
    />
  );
}

export function CancelInvitationButton({ orgId, invitationId, email }: { orgId: string; invitationId: string; email: string }) {
  const { run } = useAction();
  return (
    <ConfirmButton
      label={`Cancel invitation for ${email}`}
      title={`Cancel the invitation for ${email}?`}
      body="The link in the email stops working."
      confirmLabel="Cancel invitation"
      onConfirm={() => run(() => cancelInvitation(orgId, invitationId), "Invitation cancelled")}
    />
  );
}

export function InviteMemberForm({ orgId }: { orgId: string }) {
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("member");
  const { busy, run } = useAction();
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run(() => inviteMember(orgId, email, role), "Invitation sent")) setEmail("");
      }}
    >
      <Field className="flex-1">
        <FieldLabel htmlFor="invite-email">Invite by email</FieldLabel>
        <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} required />
      </Field>
      <Select value={role} onValueChange={(v) => setRole(v as Role)} disabled={busy}>
        <SelectTrigger className="w-full sm:w-32" aria-label="Role">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((r) => (
            <SelectItem key={r} value={r}>
              {r}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" disabled={busy || !email.trim()}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Send invitation
      </Button>
    </form>
  );
}
