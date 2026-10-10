"use client";

import * as React from "react";
import {
  CopyIcon,
  KeyRoundIcon,
  MoreHorizontalIcon,
  PaletteIcon,
  PencilIcon,
  Trash2Icon,
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
import type { RegistrationSource } from "@ostiary/core/lib/client-registration-policy";
import { AppBrandingDialog } from "@/components/admin/applications/app-branding-dialog";
import { ApplicationEditDialog } from "@/components/admin/applications/application-edit-dialog";
import { ApplicationRotateSecretDialog } from "@/components/admin/applications/application-rotate-secret-dialog";
import { routeError } from "@/lib/oauth-client-payload";

export type OAuthApplicationRow = {
  clientId: string;
  name: string;
  public: boolean;
  skipConsent: boolean;
  disabled: boolean;
  tokenEndpointAuthMethod:
    | "none"
    | "client_secret_basic"
    | "client_secret_post"
    | "private_key_jwt";
  grantTypes: string[];
  redirectUris: string[];
  createdAt: string;
  /** Registered by an admin, or by the client itself (see client-registration-policy.ts). */
  registration: RegistrationSource;
};

export function AdminApplicationRowActions({
  row,
  onChanged,
  onNotify,
}: {
  row: OAuthApplicationRow;
  onChanged: () => void;
  onNotify: (message: string, variant?: "error" | "success") => void;
}) {
  const t = useTranslations("admin.pages.applications.rowActions");
  const tc = useTranslations("admin.common");
  const [removeOpen, setRemoveOpen] = React.useState(false);
  const [removePending, setRemovePending] = React.useState(false);
  const [rotateOpen, setRotateOpen] = React.useState(false);
  const [brandingOpen, setBrandingOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [editPending, setEditPending] = React.useState(false);
  // A new key per opening, so the edit form starts from the current row.
  const [editKey, setEditKey] = React.useState(0);

  const canRotateSecret = !row.public && !row.disabled;

  function openEdit() {
    setEditKey((key) => key + 1);
    setEditOpen(true);
  }

  async function removeClient() {
    setRemovePending(true);
    try {
      const res = await fetch(
        `/api/admin/oauth-clients/${encodeURIComponent(row.clientId)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        const json: unknown = await res.json().catch(() => null);
        onNotify(routeError(json) ?? t("deleteDialog.deleteFailed"), "error");
        return;
      }
      onNotify(t("deleteDialog.deleted"), "success");
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
            aria-label={t("menuLabel", { name: row.name })}
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={() => {
              void navigator.clipboard.writeText(row.clientId);
              onNotify(t("clientIdCopied"), "success");
            }}
          >
            <CopyIcon />
            {t("copyClientId")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => openEdit()}
            title={t("editHint")}
          >
            <PencilIcon />
            {t("edit")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setBrandingOpen(true)}
            title={t("brandingHint")}
          >
            <PaletteIcon />
            {t("branding")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canRotateSecret}
            title={
              row.public
                ? t("rotateHintPublic")
                : row.disabled
                  ? t("rotateHintDisabled")
                  : t("rotateHint")
            }
            onClick={() => setRotateOpen(true)}
          >
            <KeyRoundIcon />
            {t("rotateSecret")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={row.disabled}
            onClick={() => setRemoveOpen(true)}
          >
            <Trash2Icon />
            {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AppBrandingDialog
        clientId={row.clientId}
        open={brandingOpen}
        onOpenChange={setBrandingOpen}
        onNotify={onNotify}
      />

      <ApplicationEditDialog
        key={editKey}
        row={row}
        open={editOpen}
        onOpenChange={setEditOpen}
        pending={editPending}
        onPendingChange={setEditPending}
        onChanged={onChanged}
        onNotify={onNotify}
      />

      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteDialog.title")}</DialogTitle>
            <DialogDescription>
              {t.rich("deleteDialog.description", {
                name: row.name,
                clientId: row.clientId,
                strong: (c) => <span className="font-medium text-foreground">{c}</span>,
                code: (c) => <code className="font-mono text-xs">{c}</code>,
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
              onClick={() => void removeClient()}
            >
              {removePending ? tc("deleting") : tc("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ApplicationRotateSecretDialog
        row={row}
        open={rotateOpen}
        onOpenChange={setRotateOpen}
        onChanged={onChanged}
        onNotify={onNotify}
      />
    </>
  );
}
