"use client";

import * as React from "react";
import { CopyIcon } from "lucide-react";
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
import { Input } from "@ostiary/core/components/ui/input";
import { Label } from "@ostiary/core/components/ui/label";
import type { OAuthApplicationRow } from "@/components/admin/applications/admin-application-row-actions";
import { asRecord, routeError } from "@/lib/oauth-client-payload";

/** Issues a new client secret and shows it once. */
export function ApplicationRotateSecretDialog({
  row,
  open,
  onOpenChange,
  onChanged,
  onNotify,
}: {
  row: OAuthApplicationRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
  onNotify: (message: string, variant?: "error" | "success") => void;
}) {
  const t = useTranslations("admin.pages.applications.rowActions");
  const tc = useTranslations("admin.common");
  const [pending, setPending] = React.useState(false);
  const [newSecret, setNewSecret] = React.useState<string | null>(null);

  async function rotateSecret() {
    setPending(true);
    setNewSecret(null);
    try {
      const res = await fetch(
        `/api/admin/oauth-clients/${encodeURIComponent(row.clientId)}/rotate-secret`,
        { method: "POST", credentials: "include" },
      );
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        onNotify(routeError(json) ?? t("rotateDialog.rotateFailed"), "error");
        return;
      }
      const secret = asRecord(asRecord(json)?.data)?.client_secret;
      if (typeof secret === "string" && secret) {
        setNewSecret(secret);
        onNotify(t("rotateDialog.newSecretIssued"), "success");
      } else {
        onNotify(t("rotateDialog.rotated"), "success");
        onOpenChange(false);
        onChanged();
      }
    } finally {
      setPending(false);
    }
  }

  function close() {
    onOpenChange(false);
    setNewSecret(null);
    onChanged();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("rotateDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("rotateDialog.description")}
          </DialogDescription>
        </DialogHeader>
        {newSecret ? (
          <div className="grid gap-2 py-2">
            <Label>{t("rotateDialog.newSecretLabel")}</Label>
            <Input readOnly value={newSecret} className="font-mono text-xs" />
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => {
                void navigator.clipboard.writeText(newSecret);
                onNotify(t("rotateDialog.secretCopied"), "success");
              }}
            >
              <CopyIcon />
              {t("rotateDialog.copySecret")}
            </Button>
          </div>
        ) : null}
        <DialogFooter>
          {newSecret ? (
            <Button onClick={() => close()}>{tc("done")}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {tc("cancel")}
              </Button>
              <Button
                disabled={pending}
                onClick={() => void rotateSecret()}
              >
                {pending ? t("rotateDialog.rotating") : t("rotateSecret")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
