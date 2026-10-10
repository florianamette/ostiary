"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@ostiary/core/components/ui/button";
import { DialogFooter } from "@ostiary/core/components/ui/dialog";

/**
 * Cancel and confirm buttons of an admin dialog. Without `onConfirm`, the confirm button submits
 * the surrounding form. Both are disabled while `busy`, and the confirm button spins.
 */
export function DialogActions({
  busy,
  onCancel,
  onConfirm,
  confirmLabel,
  confirmDisabled = false,
  destructive = false,
  cancelLabel,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm?: () => void;
  confirmLabel: string;
  confirmDisabled?: boolean;
  destructive?: boolean;
  cancelLabel?: string;
}) {
  const tc = useTranslations("admin.common");
  return (
    <DialogFooter>
      <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
        {cancelLabel ?? tc("cancel")}
      </Button>
      <Button
        type={onConfirm ? "button" : "submit"}
        variant={destructive ? "destructive" : "default"}
        disabled={busy || confirmDisabled}
        onClick={onConfirm}
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {confirmLabel}
      </Button>
    </DialogFooter>
  );
}
