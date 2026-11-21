"use client";

import * as React from "react";
import {
  BracesIcon,
  CopyIcon,
  KeyRoundIcon,
  MoreHorizontalIcon,
  PaletteIcon,
  PencilIcon,
  Trash2Icon,
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
import type { RegistrationSource } from "@ostiary/core/lib/client-registration-policy";
import { AppBrandingDialog } from "@/components/admin/applications/app-branding-dialog";
import { ClientClaimsDialog } from "@/components/admin/applications/client-claims-dialog";
import { ApplicationEditDialog } from "@/components/admin/applications/application-edit-dialog";
import { ApplicationRotateSecretDialog } from "@/components/admin/applications/application-rotate-secret-dialog";
import { routeError } from "@/lib/oauth-client-payload";
import { ConfirmRemoveDialog } from "@/components/admin/common/confirm-remove-dialog";
import { useAdminAction } from "@/components/admin/common/use-admin-action";

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
  /** RP-initiated logout (`enable_end_session`); set for admin-registered rows, which can be edited. */
  enableEndSession?: boolean;
  /** Where the end-session endpoint may send the user back to. */
  postLogoutRedirectUris?: string[];
  /** The registered icon (`logo_uri`), or null when the app uses its site's icon or a monogram. */
  logoUri: string | null;
  createdAt: string;
  /** Registered by an admin, or by the client itself (see client-registration-policy.ts). */
  registration: RegistrationSource;
  /** Shared by identical self-registered public clients, which the list collapses into one row. */
  dedupeKey?: string | null;
};

export function AdminApplicationRowActions({
  row,
  onChanged,
}: {
  row: OAuthApplicationRow;
  onChanged: () => void;
}) {
  const t = useTranslations("admin.pages.applications.rowActions");
  const tc = useTranslations("admin.common");
  const [removeOpen, setRemoveOpen] = React.useState(false);
  const [rotateOpen, setRotateOpen] = React.useState(false);
  const [brandingOpen, setBrandingOpen] = React.useState(false);
  const [claimsOpen, setClaimsOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [editPending, setEditPending] = React.useState(false);
  // A new key per opening, so the edit form starts from the current row.
  const [editKey, setEditKey] = React.useState(0);

  const canRotateSecret = !row.public && !row.disabled;

  function openEdit() {
    setEditKey((key) => key + 1);
    setEditOpen(true);
  }

  const remove = useAdminAction(() => setRemoveOpen(false), { refresh: onChanged });

  function removeClient() {
    void remove.run(
      async () => {
        const res = await fetch(`/api/admin/oauth-clients/${encodeURIComponent(row.clientId)}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (res.ok) return { ok: true };
        const json: unknown = await res.json().catch(() => null);
        return { ok: false, error: routeError(json) ?? t("deleteDialog.deleteFailed") };
      },
      t("deleteDialog.deleted"),
      t("deleteDialog.deleteFailed"),
    );
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
              toast.success(t("clientIdCopied"));
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
            onClick={() => setClaimsOpen(true)}
            title={t("claimsHint")}
          >
            <BracesIcon />
            {t("claims")}
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
      />

      <ClientClaimsDialog
        clientId={row.clientId}
        open={claimsOpen}
        onOpenChange={setClaimsOpen}
      />

      <ApplicationEditDialog
        key={editKey}
        row={row}
        open={editOpen}
        onOpenChange={setEditOpen}
        pending={editPending}
        onPendingChange={setEditPending}
        onChanged={onChanged}
      />

      <ConfirmRemoveDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={t("deleteDialog.title")}
        description={t.rich("deleteDialog.description", {
          name: row.name,
          clientId: row.clientId,
          strong: (c) => <span className="font-medium text-foreground">{c}</span>,
          code: (c) => <code className="font-mono text-xs">{c}</code>,
        })}
        pending={remove.busy}
        onConfirm={removeClient}
        confirmLabel={tc("delete")}
      />

      <ApplicationRotateSecretDialog
        row={row}
        open={rotateOpen}
        onOpenChange={setRotateOpen}
        onChanged={onChanged}
      />
    </>
  );
}
