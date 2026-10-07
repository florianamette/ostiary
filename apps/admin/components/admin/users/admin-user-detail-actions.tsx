"use client";

import * as React from "react";
import { Loader2, LogOutIcon, UserRoundSearch } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { toast } from "sonner";

import { AdminUserRowActions } from "@/components/admin/users/admin-user-row-actions";
import { Button } from "@ostiary/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ostiary/core/components/ui/dialog";
import { authClient } from "@/lib/auth-client";
import {
  revokeAllUserSessions,
  revokeUserSession,
} from "@/app/[locale]/(console)/users/[id]/actions";

type DetailUser = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  banned: boolean | null;
  emailVerified: boolean;
};

/** Header actions on the user page: impersonate, sign out everywhere, and the row menu. */
export function AdminUserDetailActions({
  user,
  currentUserId,
  authAppUrl,
}: {
  user: DetailUser;
  currentUserId: string;
  authAppUrl: string;
}) {
  const router = useRouter();
  const locale = useLocale();
  const isSelf = user.id === currentUserId;
  const [confirm, setConfirm] = React.useState<"impersonate" | "signout" | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function impersonate() {
    setBusy(true);
    try {
      const { error } = await authClient.admin.impersonateUser({ userId: user.id });
      if (error) {
        toast.error(error.message ?? "Could not impersonate this user.");
        return;
      }
      // The session cookie is shared across apps; continue as the user on their dashboard.
      window.location.href = `${authAppUrl}/${locale}/dashboard`;
    } finally {
      setBusy(false);
    }
  }

  async function signOutEverywhere() {
    setBusy(true);
    try {
      const { ok, count } = await revokeAllUserSessions(user.id);
      if (!ok) {
        toast.error("Could not sign this user out.");
        return;
      }
      toast.success(count === 1 ? "Signed out of 1 session" : `Signed out of ${count} sessions`);
      setConfirm(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {isSelf ? null : (
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => setConfirm("impersonate")} disabled={Boolean(user.banned)}>
            <UserRoundSearch className="size-4" aria-hidden />
            Impersonate
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setConfirm("signout")}>
            <LogOutIcon className="size-4" aria-hidden />
            Sign out everywhere
          </Button>
        </>
      )}
      <AdminUserRowActions
        user={user}
        currentUserId={currentUserId}
        onChanged={() => router.refresh()}
        onNotify={(message, variant = "success") =>
          variant === "error" ? toast.error(message) : toast.success(message)
        }
      />

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && !busy && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirm === "impersonate" ? `Sign in as ${user.email}?` : `Sign ${user.email} out everywhere?`}
            </DialogTitle>
            <DialogDescription>
              {confirm === "impersonate"
                ? "You will see the account dashboard exactly as this user does, for up to an hour. A banner there lets you stop and return. This is recorded in the audit log."
                : "Every session of this user ends now, on every device. They will need to sign in again."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={confirm === "signout" ? "destructive" : "default"}
              disabled={busy}
              onClick={() => void (confirm === "impersonate" ? impersonate() : signOutEverywhere())}
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {confirm === "impersonate" ? "Impersonate" : "Sign out everywhere"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Revoke button for one row of the sessions table. */
export function RevokeSessionButton({ userId, sessionId }: { userId: string; sessionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { ok } = await revokeUserSession(userId, sessionId);
          if (ok) {
            toast.success("Session revoked");
            router.refresh();
          } else toast.error("Could not revoke this session.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      Revoke
    </Button>
  );
}
