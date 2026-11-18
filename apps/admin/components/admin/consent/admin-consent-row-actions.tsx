"use client";

import * as React from "react";
import { CopyIcon, MoreHorizontalIcon, Trash2Icon } from "lucide-react";
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
import { revokeConsent } from "@/app/[locale]/(console)/consent/actions";
import { ConfirmRemoveDialog } from "@/components/admin/common/confirm-remove-dialog";
import { useAdminAction } from "@/components/admin/common/use-admin-action";

export type OAuthConsentRow = {
  id: string;
  userId: string | null;
  userLabel: string;
  clientId: string;
  clientLabel: string;
  clientIcon: string | null;
  referenceId?: string;
  scopes: string[];
  createdAt: string;
  updatedAt: string;
};

export function AdminConsentRowActions({ row }: { row: OAuthConsentRow }) {
  const t = useTranslations("admin.pages.consent.rowActions");
  const [removeOpen, setRemoveOpen] = React.useState(false);
  const { busy, run } = useAdminAction(() => setRemoveOpen(false));

  function copy(value: string, done: string) {
    void navigator.clipboard.writeText(value).then(() => toast.success(done));
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
          <DropdownMenuItem onClick={() => copy(row.id, t("consentIdCopied"))}>
            <CopyIcon />
            {t("copyConsentId")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => copy(row.clientId, t("clientIdCopied"))}>
            <CopyIcon />
            {t("copyClientId")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setRemoveOpen(true)}>
            <Trash2Icon />
            {t("revoke")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmRemoveDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={t("dialogTitle")}
        description={t.rich("dialogDescription", {
          user: row.userLabel,
          client: row.clientLabel,
          clientId: row.clientId,
          strong: (c) => <span className="font-medium text-foreground">{c}</span>,
          code: (c) => <code className="font-mono text-xs">{c}</code>,
        })}
        pending={busy}
        onConfirm={() => void run(() => revokeConsent(row.id), t("revoked"))}
        confirmLabel={t("revokeButton")}
      />
    </>
  );
}
