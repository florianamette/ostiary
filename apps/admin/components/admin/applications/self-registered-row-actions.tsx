"use client";

import * as React from "react";
import { BanIcon, CheckCircle2Icon, Loader2, MoreHorizontalIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
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
import {
  deleteSelfRegisteredClient,
  setSelfRegisteredClientDisabled,
} from "@/app/[locale]/(console)/applications/actions";
import type { OAuthApplicationRow } from "@/components/admin/applications/admin-application-row-actions";

/**
 * Actions for a client that registered itself: it has no owner, so it cannot be edited like
 * an admin's client. An admin can disable it (it keeps its id; Better Auth refuses it) or
 * delete it.
 */
export function SelfRegisteredRowActions({ row }: { row: OAuthApplicationRow }) {
  const router = useRouter();
  const t = useTranslations("admin.pages.applications.selfRegistered");
  const tc = useTranslations("admin.common");
  // The dialog's content stays while it animates closed, so only `open` is cleared.
  const [confirm, setConfirmKind] = React.useState<"disable" | "delete">("disable");
  const [open, setOpen] = React.useState(false);
  const setConfirm = (kind: "disable" | "delete" | null) => {
    if (kind) setConfirmKind(kind);
    setOpen(kind !== null);
  };
  const [busy, setBusy] = React.useState(false);
  const metadataDocument = row.registration === "metadata_document";

  async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) {
        adminNotify(res.error, "error");
        return;
      }
      adminNotify(success, "success");
      setConfirm(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("menuLabel", { name: row.name })}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {row.disabled ? (
            <DropdownMenuItem
              disabled={busy}
              onSelect={() => void run(() => setSelfRegisteredClientDisabled(row.clientId, false), t("enabled"))}
            >
              <CheckCircle2Icon />
              {tc("enable")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setConfirm("disable")}>
              <BanIcon />
              {tc("disable")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}>
            <Trash2Icon />
            {tc("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={(next) => !next && !busy && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          {confirm === "disable" ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("disableTitle", { name: row.name })}</DialogTitle>
                <DialogDescription>
                  {t("disableDescription")}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>
                  {tc("cancel")}
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void run(() => setSelfRegisteredClientDisabled(row.clientId, true), t("disabled"))}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  {tc("disable")}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{t("deleteTitle", { name: row.name })}</DialogTitle>
                <DialogDescription>
                  {metadataDocument
                    ? t("deleteDescriptionMetadataDocument")
                    : t("deleteDescriptionDynamic")}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>
                  {tc("cancel")}
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void run(() => deleteSelfRegisteredClient(row.clientId), t("deleted"))}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  {tc("delete")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
