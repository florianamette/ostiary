"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CopyMinusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@ostiary/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ostiary/core/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { MAX_UNUSED_CLIENT_DAYS } from "@ostiary/core/lib/client-dedupe-policy";
import { removeUnusedDuplicateClients } from "@/app/[locale]/(console)/applications/actions";
import { CheckboxField } from "@/components/admin/common/choice-field";
import { DialogActions } from "@/components/admin/common/dialog-actions";

/**
 * "Remove unused duplicates": keeps the most recently used of each group of identical
 * self-registered clients and deletes the others that hold no live token. Optionally also
 * deletes self-registered clients never used after some days.
 */
export function RemoveDuplicatesDialog() {
  const t = useTranslations("admin.pages.applications.cleanup");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [prune, setPrune] = React.useState(false);
  const [days, setDays] = React.useState("30");

  async function remove() {
    setBusy(true);
    try {
      const res = await removeUnusedDuplicateClients(prune ? Number(days) : null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.inUse > 0 ? t("doneInUse", { removed: res.removed, inUse: res.inUse }) : t("done", { removed: res.removed }),
      );
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <CopyMinusIcon />
        {t("trigger")}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-2">
            <Field>
              <CheckboxField
                id="cleanup-prune"
                checked={prune}
                onChange={setPrune}
                disabled={busy}
                label={t("pruneLabel")}
                hint={t("pruneHint")}
              />
            </Field>
            {prune ? (
              <Field>
                <FieldLabel htmlFor="cleanup-days">{t("daysLabel")}</FieldLabel>
                <Input
                  id="cleanup-days"
                  type="number"
                  min={1}
                  max={MAX_UNUSED_CLIENT_DAYS}
                  step={1}
                  inputMode="numeric"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  disabled={busy}
                  className="w-32"
                />
              </Field>
            ) : null}
          </FieldGroup>
          <DialogActions
            busy={busy}
            onCancel={() => setOpen(false)}
            onConfirm={() => void remove()}
            confirmLabel={t("confirm")}
            destructive
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
