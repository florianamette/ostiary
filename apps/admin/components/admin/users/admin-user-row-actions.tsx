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
import { toast } from "sonner";

import { Button } from "@ostiary/core/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ostiary/core/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { UserEditDialog, UserPasswordDialog } from "@/components/admin/users/admin-user-dialogs";
import { ConfirmRemoveDialog } from "@/components/admin/common/confirm-remove-dialog";
import { useAdminAction } from "@/components/admin/common/use-admin-action";

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
  const [editOpen, setEditOpen] = React.useState(false);
  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const [removeOpen, setRemoveOpen] = React.useState(false);

  const isSelf = currentUserId !== undefined && user.id === currentUserId;
  const roles = roleTokens(user.role);
  const isAdmin = roles.includes("admin");
  const isPlainUser = roles.length === 0 || (roles.length === 1 && roles[0] === "user");

  const { run } = useAdminAction(undefined, { refresh: onChanged });
  const remove = useAdminAction(() => setRemoveOpen(false), { refresh: onChanged });

  function setRole(role: "admin" | "user") {
    void run(() => authClient.admin.setRole({ userId: user.id, role }), t("roleSet", { role }), t("roleError"));
  }

  function toggleBan() {
    if (user.banned) {
      void run(() => authClient.admin.unbanUser({ userId: user.id }), t("unbanned"), t("unbanError"));
    } else {
      void run(
        () => authClient.admin.banUser({ userId: user.id, banReason: "Admin action" }),
        t("banned"),
        t("banError"),
      );
    }
  }

  function removeUser() {
    void remove.run(() => authClient.admin.removeUser({ userId: user.id }), t("removed"), t("removeError"));
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
              toast.success(t("idCopied"));
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
            onClick={() => setRole("admin")}
          >
            <KeyRoundIcon />
            {t("makeAdmin")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isPlainUser}
            onClick={() => setRole("user")}
          >
            <KeyRoundIcon />
            {t("makeUser")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={isSelf}
            onClick={toggleBan}
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

      <ConfirmRemoveDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        className="sm:max-w-sm"
        title={t("removeTitle")}
        description={t.rich("removeDescription", {
          name: user.name,
          email: user.email,
          strong: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
        })}
        pending={remove.busy}
        onConfirm={removeUser}
        confirmLabel={t("removeConfirm")}
      />
    </>
  );
}
