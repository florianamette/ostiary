"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ostiary/core/components/ui/dialog";
import { Input } from "@ostiary/core/components/ui/input";
import { Label } from "@ostiary/core/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { DialogActions } from "@/components/admin/common/dialog-actions";
import { useAdminAction } from "@/components/admin/common/use-admin-action";

type DialogProps = {
  user: { id: string; name: string; email: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
};

/** Edits a user's name and email; only the changed fields are sent. */
export function UserEditDialog({ user, open, onOpenChange, onChanged }: DialogProps) {
  const t = useTranslations("admin.pages.users.rowActions");
  const tc = useTranslations("admin.common");
  const [editName, setEditName] = React.useState(user.name);
  const [editEmail, setEditEmail] = React.useState(user.email);
  const { busy: editPending, run } = useAdminAction(() => onOpenChange(false), { refresh: onChanged });

  React.useEffect(() => {
    if (open) return;
    setEditName(user.name);
    setEditEmail(user.email);
  }, [user.name, user.email, open]);

  async function saveProfile() {
    const nameTrim = editName.trim();
    const emailTrim = editEmail.trim();
    if (!emailTrim) {
      toast.error(t("emailRequired"));
      return;
    }
    const data: Record<string, string> = {};
    if (nameTrim !== user.name) data.name = nameTrim;
    if (emailTrim !== user.email) data.email = emailTrim;
    if (Object.keys(data).length === 0) {
      toast.error(t("noChanges"));
      return;
    }
    await run(() => authClient.admin.updateUser({ userId: user.id, data }), t("updated"), t("updateError"));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) {
          setEditName(user.name);
          setEditEmail(user.email);
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
          <DialogDescription>
            {t("editDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-2">
            <Label htmlFor={`edit-name-${user.id}`}>{t("name")}</Label>
            <Input
              id={`edit-name-${user.id}`}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              autoComplete="name"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`edit-email-${user.id}`}>{t("email")}</Label>
            <Input
              id={`edit-email-${user.id}`}
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
        </div>
        <DialogActions
          busy={editPending}
          onCancel={() => onOpenChange(false)}
          onConfirm={() => void saveProfile()}
          confirmLabel={editPending ? tc("saving") : tc("save")}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Sets a new password for a user, typed twice. */
export function UserPasswordDialog({ user, open, onOpenChange, onChanged }: DialogProps) {
  const t = useTranslations("admin.pages.users.rowActions");
  const tc = useTranslations("admin.common");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const { busy: passwordPending, run } = useAdminAction(() => onOpenChange(false), { refresh: onChanged });
  const [passwordFormError, setPasswordFormError] = React.useState<
    string | null
  >(null);

  React.useEffect(() => {
    if (!open) {
      setNewPassword("");
      setConfirmPassword("");
      setPasswordFormError(null);
    }
  }, [open]);

  async function savePassword() {
    setPasswordFormError(null);
    if (!newPassword) {
      setPasswordFormError(t("passwordRequired"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFormError(t("passwordMismatch"));
      return;
    }
    await run(
      () => authClient.admin.setUserPassword({ userId: user.id, newPassword }),
      t("passwordUpdated"),
      t("passwordError"),
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("passwordTitle")}</DialogTitle>
          <DialogDescription>
            {t.rich("passwordDescription", {
              email: user.email,
              strong: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
              code: (chunks) => <code className="text-foreground">{chunks}</code>,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-2">
            <Label htmlFor={`new-pw-${user.id}`}>{t("newPassword")}</Label>
            <Input
              id={`new-pw-${user.id}`}
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`confirm-pw-${user.id}`}>{t("confirmPassword")}</Label>
            <Input
              id={`confirm-pw-${user.id}`}
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          {passwordFormError ? (
            <p className="text-destructive text-sm" role="alert">
              {passwordFormError}
            </p>
          ) : null}
        </div>
        <DialogActions
          busy={passwordPending}
          onCancel={() => onOpenChange(false)}
          onConfirm={() => void savePassword()}
          confirmLabel={passwordPending ? tc("saving") : t("updatePassword")}
        />
      </DialogContent>
    </Dialog>
  );
}
