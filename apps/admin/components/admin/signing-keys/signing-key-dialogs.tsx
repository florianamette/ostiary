"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ostiary/core/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@ostiary/core/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ostiary/core/components/ui/select";
import {
  GRACE_PERIOD_DAYS,
  ROTATION_INTERVAL_DAYS,
  type SigningKeySettings,
} from "@ostiary/core/lib/signing-keys-policy";
import { rotateSigningKeyNow, updateSigningKeySettings } from "@/app/[locale]/(console)/signing-keys/actions";
import { DialogActions } from "@/components/admin/common/dialog-actions";

/** Edits the rotation interval and grace period. */
export function RotationDialog({ settings, onClose }: { settings: SigningKeySettings; onClose: () => void }) {
  const t = useTranslations("admin.pages.signingKeys");
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [intervalDays, setIntervalDays] = React.useState(String(settings.rotationIntervalDays));
  const [graceDays, setGraceDays] = React.useState(String(settings.gracePeriodDays));
  // A stored value outside the offered choices (written by another version) stays selectable.
  const intervals = [...new Set<number>([...ROTATION_INTERVAL_DAYS, settings.rotationIntervalDays])].sort((a, b) => a - b);
  const graces = [...new Set<number>([...GRACE_PERIOD_DAYS, settings.gracePeriodDays])].sort((a, b) => a - b);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await updateSigningKeySettings({
        rotationIntervalDays: Number(intervalDays),
        gracePeriodDays: Number(graceDays),
      });
      if (!res.ok) {
        toast.error(t(`errors.${res.error}`));
        return;
      }
      toast.success(t("rotation.saved"));
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={save} className="grid gap-6">
          <DialogHeader>
            <DialogTitle>{t("rotation.dialogTitle")}</DialogTitle>
            <DialogDescription>{t("rotation.dialogDescription")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="signing-key-interval">{t("rotation.interval")}</FieldLabel>
              <Select value={intervalDays} onValueChange={setIntervalDays} disabled={busy}>
                <SelectTrigger id="signing-key-interval" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {intervals.map((days) => (
                    <SelectItem key={days} value={String(days)}>
                      {days > 0 ? t("rotation.every", { count: days }) : t("rotation.never")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>{t("rotation.intervalHint")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="signing-key-grace">{t("rotation.grace")}</FieldLabel>
              <Select value={graceDays} onValueChange={setGraceDays} disabled={busy}>
                <SelectTrigger id="signing-key-grace" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {graces.map((days) => (
                    <SelectItem key={days} value={String(days)}>
                      {t("days", { count: days })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>{t("rotation.graceHint")}</FieldDescription>
            </Field>
          </FieldGroup>
          <DialogActions busy={busy} onCancel={onClose} cancelLabel={t("rotation.cancel")} confirmLabel={t("rotation.save")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Confirms a rotation now: what changes for apps and old tokens. */
export function RotateDialog({ gracePeriodDays, onClose }: { gracePeriodDays: number; onClose: () => void }) {
  const t = useTranslations("admin.pages.signingKeys");
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function rotate() {
    setBusy(true);
    try {
      const res = await rotateSigningKeyNow();
      if (!res.ok) {
        toast.error(t(`errors.${res.error}`));
        return;
      }
      toast.success(t("rotate.done", { kid: res.keyId }));
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("rotate.title")}</DialogTitle>
          <DialogDescription>{t("rotate.newKey")}</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>{t("rotate.caching")}</li>
          <li>{t("rotate.oldTokens", { grace: t("days", { count: gracePeriodDays }) })}</li>
          <li>{t("rotate.compromised")}</li>
        </ul>
        <DialogActions
          busy={busy}
          onCancel={onClose}
          cancelLabel={t("rotate.cancel")}
          onConfirm={() => void rotate()}
          confirmLabel={t("rotate.confirm")}
        />
      </DialogContent>
    </Dialog>
  );
}
