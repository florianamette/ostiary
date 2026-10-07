"use client";

import * as React from "react";
import {
  CopyIcon,
  EyeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
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
import { authClient } from "@/lib/auth-client";

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
  onNotify,
}: {
  row: OAuthConsentRow;
  onChanged: () => void;
  onNotify: (message: string, variant?: "error" | "success") => void;
}) {
  const [removeOpen, setRemoveOpen] = React.useState(false);
  const [removePending, setRemovePending] = React.useState(false);

  async function revokeConsent() {
    setRemovePending(true);
    try {
      const { error } = await authClient.oauth2.deleteConsent({
        id: row.id,
      });
      if (error) {
        onNotify(error.message ?? "Could not revoke consent", "error");
        return;
      }
      onNotify("Consent revoked", "success");
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
            aria-label={`Actions for consent ${row.id.slice(0, 12)}…`}
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={() => {
              void navigator.clipboard.writeText(row.id);
              onNotify("Consent ID copied", "success");
            }}
          >
            <CopyIcon />
            Copy consent ID
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              void navigator.clipboard.writeText(row.clientId);
              onNotify("Client ID copied", "success");
            }}
          >
            <CopyIcon />
            Copy client ID
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled
            title="Wire to authClient.oauth2.getConsent"
          >
            <EyeIcon />
            View details
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled
            title="Wire to authClient.oauth2.updateConsent"
          >
            <PencilIcon />
            Update scopes
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setRemoveOpen(true)}
          >
            <Trash2Icon />
            Revoke consent
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke consent?</DialogTitle>
            <DialogDescription>
              Removes this user&apos;s grant for{" "}
              <span className="font-medium text-foreground">
                {row.clientLabel}
              </span>{" "}
              (<code className="font-mono text-xs">{row.clientId}</code>). The
              client may need to request authorization again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={removePending}
              onClick={() => void revokeConsent()}
            >
              {removePending ? "Revoking…" : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
