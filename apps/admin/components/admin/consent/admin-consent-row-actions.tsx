"use client";

import * as React from "react";
import {
  CopyIcon,
  EyeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@ostiary/core/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ostiary/core/components/ui/dropdown-menu";
import { adminNotify } from "@ostiary/core/lib/admin/admin-notify";
import { authClient } from "@/lib/auth-client";
import { ConfirmRemoveDialog } from "@/components/admin/common/confirm-remove-dialog";

export type OAuthConsentRow = {
  id: string;
  userId: string;
  userLabel: string;
  clientId: string;
  clientLabel: string;
  referenceId?: string;
  scopes: string[];
  createdAt: string;
  updatedAt: string;
};

export function AdminConsentRowActions({
  row,
  onChanged,
}: {
  row: OAuthConsentRow;
  onChanged: () => void;
}) {
  const t = useTranslations("admin.pages.consent.rowActions");
  const [removeOpen, setRemoveOpen] = React.useState(false);
  const [removePending, setRemovePending] = React.useState(false);

  async function revokeConsent() {
    setRemovePending(true);
    try {
      const { error } = await authClient.oauth2.deleteConsent({
        id: row.id,
      });
      if (error) {
        adminNotify(error.message ?? t("revokeFailed"), "error");
        return;
      }
      adminNotify(t("revoked"), "success");
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
            aria-label={t("menuLabel", { id: row.id.slice(0, 12) })}
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={() => {
              void navigator.clipboard.writeText(row.id);
              adminNotify(t("consentIdCopied"), "success");
            }}
          >
            <CopyIcon />
            {t("copyConsentId")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              void navigator.clipboard.writeText(row.clientId);
              adminNotify(t("clientIdCopied"), "success");
            }}
          >
            <CopyIcon />
            {t("copyClientId")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled
            title={t("wireTo", { method: "authClient.oauth2.getConsent" })}
          >
            <EyeIcon />
            {t("viewDetails")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled
            title={t("wireTo", { method: "authClient.oauth2.updateConsent" })}
          >
            <PencilIcon />
            {t("updateScopes")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setRemoveOpen(true)}
          >
            <Trash2Icon />
            {t("revoke")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmRemoveDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        className="sm:max-w-md"
        title={t("dialogTitle")}
        description={t.rich("dialogDescription", {
          client: row.clientLabel,
          clientId: row.clientId,
          strong: (c) => <span className="font-medium text-foreground">{c}</span>,
          code: (c) => <code className="font-mono text-xs">{c}</code>,
        })}
        pending={removePending}
        onConfirm={() => void revokeConsent()}
        confirmLabel={t("revokeButton")}
        pendingLabel={t("revoking")}
      />
    </>
  );
}
