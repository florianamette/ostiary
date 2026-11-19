"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ostiary/core/components/ui/dialog";
import { DialogActions } from "@/components/admin/common/dialog-actions";

/**
 * Asks before removing something. While `pending`, both buttons are disabled, the confirm
 * button spins and the dialog cannot be dismissed, so the result is seen in it.
 */
export function ConfirmRemoveDialog({
  open,
  onOpenChange,
  className = "sm:max-w-md",
  title,
  description,
  pending,
  onConfirm,
  confirmLabel,
  cancelLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
  title: React.ReactNode;
  description: React.ReactNode;
  pending: boolean;
  onConfirm: () => void;
  confirmLabel: string;
  cancelLabel?: string;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className={className}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogActions
          busy={pending}
          onCancel={() => onOpenChange(false)}
          cancelLabel={cancelLabel}
          onConfirm={onConfirm}
          confirmLabel={confirmLabel}
          destructive
        />
      </DialogContent>
    </Dialog>
  );
}
