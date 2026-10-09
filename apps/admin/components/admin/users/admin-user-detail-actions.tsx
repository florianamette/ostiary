"use client";

import * as React from "react";
import { DownloadIcon, Loader2, LogOutIcon, UserRoundSearch } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
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
  exportUserData,
  resetUserTwoFactor,
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
  const t = useTranslations("admin.pages.users.detailActions");
  const tc = useTranslations("admin.common");
  const isSelf = user.id === currentUserId;
  const [confirm, setConfirm] = React.useState<"impersonate" | "signout" | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function impersonate() {
    setBusy(true);
    try {
      const { error } = await authClient.admin.impersonateUser({ userId: user.id });
      if (error) {
        toast.error(error.message ?? t("impersonateError"));
        return;
      }
      // The session cookie is shared across apps; continue as the user on their dashboard.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- another app (the auth app), with the new session
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
        toast.error(t("signOutError"));
        return;
      }
      toast.success(t("signedOut", { count }));
      setConfirm(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function exportData() {
    setBusy(true);
    try {
      const result = await exportUserData(user.id).catch(() => ({ ok: false as const }));
      if (!result.ok) {
        toast.error(t("exportError"));
        return;
      }
      const url = URL.createObjectURL(new Blob([result.json], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = result.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success(t("exported"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void exportData()}>
        <DownloadIcon className="size-4" aria-hidden />
        {t("exportData")}
      </Button>
      {isSelf ? null : (
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => setConfirm("impersonate")} disabled={Boolean(user.banned)}>
            <UserRoundSearch className="size-4" aria-hidden />
            {t("impersonate")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setConfirm("signout")}>
            <LogOutIcon className="size-4" aria-hidden />
            {t("signOutEverywhere")}
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
              {confirm === "impersonate"
                ? t("impersonateTitle", { email: user.email })
                : t("signOutTitle", { email: user.email })}
            </DialogTitle>
            <DialogDescription>
              {confirm === "impersonate"
                ? t("impersonateDescription")
                : t("signOutDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirm(null)}>
              {tc("cancel")}
            </Button>
            <Button
              type="button"
              variant={confirm === "signout" ? "destructive" : "default"}
              disabled={busy}
              onClick={() => void (confirm === "impersonate" ? impersonate() : signOutEverywhere())}
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {confirm === "impersonate" ? t("impersonate") : t("signOutEverywhere")}
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
  const t = useTranslations("admin.pages.users.detailActions");
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
            toast.success(t("sessionRevoked"));
            router.refresh();
          } else toast.error(t("revokeError"));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {t("revoke")}
    </Button>
  );
}

/** Turns off a user's two-factor authentication, after a confirmation. Audited. */
export function ResetTwoFactorButton({ userId, email }: { userId: string; email: string }) {
  const router = useRouter();
  const t = useTranslations("admin.pages.users.detailActions");
  const tc = useTranslations("admin.common");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function reset() {
    setBusy(true);
    try {
      const { ok } = await resetUserTwoFactor(userId);
      if (!ok) {
        toast.error(t("resetTwoFactorError"));
        return;
      }
      toast.success(t("twoFactorReset"));
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        {t("reset")}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !next && !busy && setOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("resetTwoFactorTitle", { email })}</DialogTitle>
            <DialogDescription>
              {t("resetTwoFactorDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => void reset()}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {t("reset")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
