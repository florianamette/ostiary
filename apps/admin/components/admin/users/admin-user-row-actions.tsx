"use client";

import * as React from "react";
import {
  BanIcon,
  CopyIcon,
  KeyRoundIcon,
  LockIcon,
  MoreHorizontalIcon,
  Trash2Icon,
  UserPenIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@ostiary/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ostiary/core/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ostiary/core/components/ui/dropdown-menu";
import { adminNotify } from "@ostiary/core/lib/admin/admin-notify";
import { authClient } from "@/lib/auth-client";
import { UserEditDialog, UserPasswordDialog } from "@/components/admin/users/admin-user-dialogs";

type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned: boolean | null;
  emailVerified?: boolean | null;
};

function roleTokens(role: string | null | undefined): string[] {
  if (!role?.trim()) return [];
  return role.split(",").map((s) => s.trim()).filter(Boolean);
}

export function AdminUserRowActions({
  user,
  currentUserId,
  onChanged,
}: {
  user: AdminUserRow;
  currentUserId?: string;
  onChanged: () => void;
}) {
  const t = useTranslations("admin.pages.users.rowActions");
  const tc = useTranslations("admin.common");
  const [editOpen, setEditOpen] = React.useState(false);
  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const [removeOpen, setRemoveOpen] = React.useState(false);
  const [removePending, setRemovePending] = React.useState(false);

  const isSelf = currentUserId !== undefined && user.id === currentUserId;
  const roles = roleTokens(user.role);
  const isAdmin = roles.includes("admin");
  const isPlainUser = roles.length === 0 || (roles.length === 1 && roles[0] === "user");

  async function setRole(role: "admin" | "user") {
    const { error } = await authClient.admin.setRole({
      userId: user.id,
      role,
    });
    if (error) {
      adminNotify(error.message ?? t("roleError"), "error");
      return;
    }
    adminNotify(t("roleSet", { role }), "success");
    onChanged();
  }

  async function toggleBan() {
    if (user.banned) {
      const { error } = await authClient.admin.unbanUser({ userId: user.id });
      if (error) {
        adminNotify(error.message ?? t("unbanError"), "error");
        return;
      }
      adminNotify(t("unbanned"), "success");
    } else {
      const { error } = await authClient.admin.banUser({
        userId: user.id,
        banReason: "Admin action",
      });
      if (error) {
        adminNotify(error.message ?? t("banError"), "error");
        return;
      }
      adminNotify(t("banned"), "success");
    }
    onChanged();
  }

  async function removeUser() {
    setRemovePending(true);
    try {
      const { error } = await authClient.admin.removeUser({
        userId: user.id,
      });
      if (error) {
        adminNotify(error.message ?? t("removeError"), "error");
        return;
      }
      adminNotify(t("removed"), "success");
      setRemoveOpen(false);
      onChanged();
    } finally {
      setRemovePending(false);
    }
  }


  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={t("menuLabel", { name: user.name })}
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            onClick={() => {
              void navigator.clipboard.writeText(user.id);
              adminNotify(t("idCopied"), "success");
            }}
          >
            <CopyIcon />
            {t("copyId")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <UserPenIcon />
            {t("edit")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPasswordOpen(true)}>
            <LockIcon />
            {t("setPassword")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isAdmin}
            onClick={() => void setRole("admin")}
          >
            <KeyRoundIcon />
            {t("makeAdmin")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isPlainUser}
            onClick={() => void setRole("user")}
          >
            <KeyRoundIcon />
            {t("makeUser")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={isSelf}
            onClick={() => void toggleBan()}
          >
            <BanIcon />
            {user.banned ? t("unban") : t("ban")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={isSelf}
            variant="destructive"
            onClick={() => setRemoveOpen(true)}
          >
            <Trash2Icon />
            {t("remove")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <UserEditDialog user={user} open={editOpen} onOpenChange={setEditOpen} onChanged={onChanged} />

      <UserPasswordDialog user={user} open={passwordOpen} onOpenChange={setPasswordOpen} onChanged={onChanged} />

      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("removeTitle")}</DialogTitle>
            <DialogDescription>
              {t.rich("removeDescription", {
                name: user.name,
                email: user.email,
                strong: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={removePending}
              onClick={() => void removeUser()}
            >
              {removePending ? t("removing") : t("removeConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
