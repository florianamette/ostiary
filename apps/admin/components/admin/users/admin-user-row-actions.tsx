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
import { Input } from "@ostiary/core/components/ui/input";
import { Label } from "@ostiary/core/components/ui/label";
import { authClient } from "@/lib/auth-client";

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
  onNotify,
}: {
  user: AdminUserRow;
  currentUserId?: string;
  onChanged: () => void;
  onNotify: (message: string, variant?: "error" | "success") => void;
}) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [editName, setEditName] = React.useState(user.name);
  const [editEmail, setEditEmail] = React.useState(user.email);
  const [editPending, setEditPending] = React.useState(false);

  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [passwordPending, setPasswordPending] = React.useState(false);
  const [passwordFormError, setPasswordFormError] = React.useState<
    string | null
  >(null);

  const [removeOpen, setRemoveOpen] = React.useState(false);
  const [removePending, setRemovePending] = React.useState(false);

  const isSelf = currentUserId !== undefined && user.id === currentUserId;

  React.useEffect(() => {
    if (editOpen) return;
    setEditName(user.name);
    setEditEmail(user.email);
  }, [user.name, user.email, editOpen]);

  React.useEffect(() => {
    if (!passwordOpen) {
      setNewPassword("");
      setConfirmPassword("");
      setPasswordFormError(null);
    }
  }, [passwordOpen]);

  async function setRole(role: "admin" | "user") {
    const { error } = await authClient.admin.setRole({
      userId: user.id,
      role,
    });
    if (error) {
      onNotify(error.message ?? "Could not update role", "error");
      return;
    }
    onNotify(`Role set to ${role}`, "success");
    onChanged();
  }

  async function toggleBan() {
    if (user.banned) {
      const { error } = await authClient.admin.unbanUser({ userId: user.id });
      if (error) {
        onNotify(error.message ?? "Could not unban user", "error");
        return;
      }
      onNotify("User unbanned", "success");
    } else {
      const { error } = await authClient.admin.banUser({
        userId: user.id,
        banReason: "Admin action",
      });
      if (error) {
        onNotify(error.message ?? "Could not ban user", "error");
        return;
      }
      onNotify("User banned", "success");
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
        onNotify(error.message ?? "Could not remove user", "error");
        return;
      }
      onNotify("User removed", "success");
      setRemoveOpen(false);
      onChanged();
    } finally {
      setRemovePending(false);
    }
  }

  async function saveProfile() {
    const nameTrim = editName.trim();
    const emailTrim = editEmail.trim();
    if (!emailTrim) {
      onNotify("Email is required", "error");
      return;
    }
    const data: Record<string, string> = {};
    if (nameTrim !== user.name) data.name = nameTrim;
    if (emailTrim !== user.email) data.email = emailTrim;
    if (Object.keys(data).length === 0) {
      onNotify("No changes to save", "error");
      return;
    }
    setEditPending(true);
    try {
      const { error } = await authClient.admin.updateUser({
        userId: user.id,
        data,
      });
      if (error) {
        onNotify(error.message ?? "Could not update user", "error");
        return;
      }
      onNotify("User updated", "success");
      setEditOpen(false);
      onChanged();
    } finally {
      setEditPending(false);
    }
  }

  async function savePassword() {
    setPasswordFormError(null);
    if (!newPassword) {
      setPasswordFormError("Enter a new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFormError("Passwords do not match.");
      return;
    }
    setPasswordPending(true);
    try {
      const { error } = await authClient.admin.setUserPassword({
        userId: user.id,
        newPassword,
      });
      if (error) {
        onNotify(error.message ?? "Could not set password", "error");
        return;
      }
      onNotify("Password updated", "success");
      setPasswordOpen(false);
      onChanged();
    } finally {
      setPasswordPending(false);
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
            aria-label={`Actions for ${user.name}`}
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            onClick={() => {
              void navigator.clipboard.writeText(user.id);
              onNotify("User ID copied", "success");
            }}
          >
            <CopyIcon />
            Copy user ID
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <UserPenIcon />
            Edit user
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPasswordOpen(true)}>
            <LockIcon />
            Set password
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={roleTokens(user.role).includes("admin")}
            onClick={() => void setRole("admin")}
          >
            <KeyRoundIcon />
            Make admin
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={(() => {
              const t = roleTokens(user.role);
              return (
                t.length === 0 ||
                (t.length === 1 && t[0] === "user")
              );
            })()}
            onClick={() => void setRole("user")}
          >
            <KeyRoundIcon />
            Make user
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={isSelf}
            onClick={() => void toggleBan()}
          >
            <BanIcon />
            {user.banned ? "Unban user" : "Ban user"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={isSelf}
            variant="destructive"
            onClick={() => setRemoveOpen(true)}
          >
            <Trash2Icon />
            Remove user
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (open) {
            setEditName(user.name);
            setEditEmail(user.email);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>
              Change the name or email address. A new email address must be verified by
              the user before they can sign in again.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label htmlFor={`edit-name-${user.id}`}>Name</Label>
              <Input
                id={`edit-name-${user.id}`}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                autoComplete="name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`edit-email-${user.id}`}>Email</Label>
              <Input
                id={`edit-email-${user.id}`}
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button disabled={editPending} onClick={() => void saveProfile()}>
              {editPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Set password</DialogTitle>
            <DialogDescription>
              Sets a new password for{" "}
              <span className="font-medium text-foreground">{user.email}</span>{" "}
              using{" "}
              <code className="text-foreground">setUserPassword</code>.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label htmlFor={`new-pw-${user.id}`}>New password</Label>
              <Input
                id={`new-pw-${user.id}`}
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`confirm-pw-${user.id}`}>Confirm password</Label>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={passwordPending}
              onClick={() => void savePassword()}
            >
              {passwordPending ? "Saving…" : "Update password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove user?</DialogTitle>
            <DialogDescription>
              This permanently deletes{" "}
              <span className="font-medium text-foreground">{user.name}</span>{" "}
              ({user.email}). This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={removePending}
              onClick={() => void removeUser()}
            >
              {removePending ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
