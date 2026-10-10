"use client";

import * as React from "react";
import { BanIcon, CheckCircle2Icon, ImageIcon, MoreHorizontalIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@ostiary/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Field, FieldGroup, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import {
  deleteSelfRegisteredClient,
  setSelfRegisteredClientDisabled,
  setSelfRegisteredClientIcon,
} from "@/app/[locale]/(console)/applications/actions";
import type { OAuthApplicationRow } from "@/components/admin/applications/admin-application-row-actions";
import { DialogActions } from "@/components/admin/common/dialog-actions";
import { useAdminAction } from "@/components/admin/common/use-admin-action";

/**
 * Actions for a client that registered itself: it has no owner, so it cannot be edited like
 * an admin's client. An admin can disable it (it keeps its id; Better Auth refuses it) or
 * delete it, and set the icon of a dynamically registered one.
 */
export function SelfRegisteredRowActions({ row }: { row: OAuthApplicationRow }) {
  const t = useTranslations("admin.pages.applications.selfRegistered");
  const te = useTranslations("admin.pages.applications.rowActions.editDialog");
  const tc = useTranslations("admin.common");
  // The dialog's content stays while it animates closed, so only `open` is cleared.
  const [confirm, setConfirmKind] = React.useState<"disable" | "delete" | "icon">("disable");
  const [open, setOpen] = React.useState(false);
  const [logoUri, setLogoUri] = React.useState(row.logoUri ?? "");
  const setConfirm = (kind: "disable" | "delete" | "icon" | null) => {
    if (kind) setConfirmKind(kind);
    if (kind === "icon") setLogoUri(row.logoUri ?? "");
    setOpen(kind !== null);
  };
  const { busy, run } = useAdminAction(() => setConfirm(null));
  const metadataDocument = row.registration === "metadata_document";

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
          {row.registration === "dynamic" ? (
            <DropdownMenuItem onSelect={() => setConfirm("icon")}>
              <ImageIcon />
              {t("setIcon")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}>
            <Trash2Icon />
            {tc("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={(next) => !next && !busy && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          {confirm === "icon" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => setSelfRegisteredClientIcon(row.clientId, logoUri), t("iconSaved"));
              }}
            >
              <DialogHeader>
                <DialogTitle>{t("iconTitle", { name: row.name })}</DialogTitle>
                <DialogDescription>{t("iconDescription")}</DialogDescription>
              </DialogHeader>
              <FieldGroup className="py-4">
                <Field>
                  <FieldLabel htmlFor={`self-registered-icon-${row.clientId}`}>{te("iconUrlLabel")}</FieldLabel>
                  <Input
                    id={`self-registered-icon-${row.clientId}`}
                    type="url"
                    value={logoUri}
                    onChange={(e) => setLogoUri(e.target.value)}
                    placeholder="https://example.com/icon.png"
                  />
                  <p className="text-muted-foreground text-xs">{te("iconUrlHint")}</p>
                </Field>
              </FieldGroup>
              <DialogActions busy={busy} onCancel={() => setConfirm(null)} confirmLabel={tc("saveChanges")} />
            </form>
          ) : confirm === "disable" ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("disableTitle", { name: row.name })}</DialogTitle>
                <DialogDescription>
                  {t("disableDescription")}
                </DialogDescription>
              </DialogHeader>
              <DialogActions
                busy={busy}
                onCancel={() => setConfirm(null)}
                onConfirm={() => void run(() => setSelfRegisteredClientDisabled(row.clientId, true), t("disabled"))}
                confirmLabel={tc("disable")}
                destructive
              />
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
              <DialogActions
                busy={busy}
                onCancel={() => setConfirm(null)}
                onConfirm={() => void run(() => deleteSelfRegisteredClient(row.clientId), t("deleted"))}
                confirmLabel={tc("delete")}
                destructive
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
