"use client";

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

/**
 * Asks before removing something from a row menu. While `pending`, the confirm button is
 * disabled and shows `pendingLabel`.
 */
export function ConfirmRemoveDialog({
  open,
  onOpenChange,
  className,
  title,
  description,
  pending,
  onConfirm,
  confirmLabel,
  pendingLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className: string;
  title: string;
  description: React.ReactNode;
  pending: boolean;
  onConfirm: () => void;
  confirmLabel: string;
  pendingLabel: string;
}) {
  const tc = useTranslations("admin.common");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={className}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
