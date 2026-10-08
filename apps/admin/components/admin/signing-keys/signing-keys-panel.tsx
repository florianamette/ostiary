"use client";

import * as React from "react";
import { Loader2, RefreshCwIcon, Settings2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@ostiary/core/components/ui/badge";
import { Button } from "@ostiary/core/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ostiary/core/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ostiary/core/components/ui/table";
import {
  GRACE_PERIOD_DAYS,
  ROTATION_INTERVAL_DAYS,
  type SigningKeySettings,
  type SigningKeyStatus,
} from "@ostiary/core/lib/signing-keys-policy";
import { rotateSigningKeyNow, updateSigningKeySettings } from "@/app/[locale]/(console)/signing-keys/actions";
import { formatDateTime } from "@/components/admin/common/page-header";

export type SigningKeyItem = {
  id: string;
  alg: string;
  crv: string | null;
  status: SigningKeyStatus;
  createdAt: string;
  expiresAt: string | null;
  unpublishedAt: string | null;
};

const STATUS_VARIANT: Record<SigningKeyStatus, "default" | "secondary" | "outline"> = {
  current: "default",
  published: "secondary",
  expired: "outline",
};

/**
 * Signing keys: automatic rotation settings, the keys with their status, and "Rotate now".
 * Only public metadata reaches this component (key id, algorithm, dates).
 */
export function SigningKeysPanel({
  settings,
  keys,
  jwksUrl,
}: {
  settings: SigningKeySettings;
  keys: SigningKeyItem[];
  jwksUrl: string;
}) {
  const t = useTranslations("admin.pages.signingKeys");
  const locale = useLocale();
  const [editOpen, setEditOpen] = React.useState(false);
  const [rotateOpen, setRotateOpen] = React.useState(false);
  const rotating = settings.rotationIntervalDays > 0;

  return (
    <>
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {t("rotation.title")}
            {rotating ? (
              <Badge variant="secondary">{t("rotation.on")}</Badge>
            ) : (
              <Badge variant="outline" className="font-normal">
                {t("rotation.off")}
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="max-w-3xl">{t("rotation.description")}</CardDescription>
          <CardAction>
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Settings2Icon />
              {t("rotation.edit")}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div className="space-y-1">
              <dt className="text-muted-foreground text-xs">{t("rotation.interval")}</dt>
              <dd className="font-medium">
                {rotating ? t("rotation.every", { count: settings.rotationIntervalDays }) : t("rotation.never")}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-muted-foreground text-xs">{t("rotation.grace")}</dt>
              <dd className="font-medium">{t("rotation.graceValue", { count: settings.gracePeriodDays })}</dd>
            </div>
          </dl>
          {jwksUrl ? (
            <p className="text-muted-foreground mt-4 text-xs break-all">
              {t("jwksUrl")}: <code className="rounded bg-muted px-1 py-0.5 font-mono">{jwksUrl}</code>
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>{t("keys.title")}</CardTitle>
          <CardDescription>{t("keys.description")}</CardDescription>
          <CardAction>
            <Button size="sm" onClick={() => setRotateOpen(true)}>
              <RefreshCwIcon />
              {t("rotate.button")}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="p-0">
          {keys.length === 0 ? (
            <p className="px-6 pb-2 text-sm text-muted-foreground">{t("keys.empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">{t("keys.keyId")}</TableHead>
                  <TableHead>{t("keys.status")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("keys.algorithm")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("keys.created")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("keys.retires")}</TableHead>
                  <TableHead className="hidden pr-6 lg:table-cell">{t("keys.unpublished")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <TableRow key={key.id} className={key.status === "expired" ? "text-muted-foreground" : undefined}>
                    <TableCell className="max-w-[16rem] truncate pl-6 font-mono text-xs" title={key.id}>
                      {key.id}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[key.status]} className="font-normal">
                        {t(`keys.${key.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs sm:table-cell">
                      {key.crv ? `${key.alg} (${key.crv})` : key.alg}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-xs md:table-cell">
                      {formatDateTime(key.createdAt, locale)}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-xs lg:table-cell">
                      {key.expiresAt ? formatDateTime(key.expiresAt, locale) : t("keys.noExpiry")}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap pr-6 text-xs lg:table-cell">
                      {key.unpublishedAt ? formatDateTime(key.unpublishedAt, locale) : t("keys.noExpiry")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {editOpen ? <RotationDialog settings={settings} onClose={() => setEditOpen(false)} /> : null}
      {rotateOpen ? <RotateDialog gracePeriodDays={settings.gracePeriodDays} onClose={() => setRotateOpen(false)} /> : null}
    </>
  );
}

function RotationDialog({ settings, onClose }: { settings: SigningKeySettings; onClose: () => void }) {
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
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              {t("rotation.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {t("rotation.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RotateDialog({ gracePeriodDays, onClose }: { gracePeriodDays: number; onClose: () => void }) {
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
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            {t("rotate.cancel")}
          </Button>
          <Button type="button" disabled={busy} onClick={rotate}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t("rotate.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
