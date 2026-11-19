"use client";

import { useTranslations } from "next-intl";

import { Button } from "@ostiary/core/components/ui/button";
import { DialogFooter } from "@ostiary/core/components/ui/dialog";

/**
 * Cancel and confirm buttons of an admin dialog, the one footer every admin dialog uses.
 * Without `onConfirm`, the confirm button submits the surrounding form. Both are disabled while
 * `busy`, and the confirm button spins.
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
        loading={busy}
        disabled={confirmDisabled}
        onClick={onConfirm}
      >
        {confirmLabel}
      </Button>
    </DialogFooter>
  );
}
