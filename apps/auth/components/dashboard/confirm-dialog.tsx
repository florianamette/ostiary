"use client";

import * as React from "react";

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
 * Asks before a destructive action: cancel, or confirm with a destructive button. When
 * `onConfirm` returns a promise, the dialog stays open with a spinner until it settles, and
 * cannot be dismissed meanwhile; the caller closes it (sets `open` to false) once done, so a
 * failure can be shown while the person still sees what they were confirming.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  children,
}: {
  open: boolean;
  title: React.ReactNode;
  description: React.ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<unknown>;
  /** Extra content between the description and the buttons. */
  children?: React.ReactNode;
}) {
  const [busy, setBusy] = React.useState(false);

  async function confirm() {
    const result = onConfirm();
    if (!(result instanceof Promise)) return;
    setBusy(true);
    try {
      await result;
    } catch {
      // The caller reports its own failures.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" variant="destructive" loading={busy} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
