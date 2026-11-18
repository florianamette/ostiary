"use client";

import * as React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { getHtmlLang } from "@ostiary/core/i18n/locale-html";
import type { AppLocale } from "@ostiary/core/i18n/routing";
import { Button } from "@ostiary/core/components/ui/button";
import { FieldDescription } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { Skeleton } from "@ostiary/core/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ostiary/core/components/ui/table";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { useAsyncResource } from "@ostiary/core/hooks/use-async-resource";
import { authClient } from "@/lib/auth-client";
import { useAuthAction } from "@/lib/use-auth-action";
import { needsRecentSignIn, signInAgain } from "@/lib/sign-in-again";

type PasskeyRow = {
  id: string;
  name?: string | null;
  createdAt: Date;
  deviceType?: string | null;
};

function isRegistrationCancelled(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "ERROR_CEREMONY_ABORTED"
  );
}

type Attachment = "platform" | "cross-platform";

/** The two ways to add a passkey: this device's authenticator, or a security key. */
const ADD_OPTIONS = [
  { attachment: "platform", labelKey: "addThisDevice" },
  { attachment: "cross-platform", labelKey: "addSecurityKey" },
] as const satisfies readonly { attachment: Attachment; labelKey: string }[];

async function listPasskeys(): Promise<PasskeyRow[]> {
  const res = await authClient.passkey.listUserPasskeys();
  if (res.error) throw res.error;
  return (Array.isArray(res.data) ? res.data : []).map((p) => ({
    id: p.id,
    name: p.name,
    createdAt: new Date(p.createdAt),
    deviceType: p.deviceType,
  }));
}

export function DashboardPasskeysSection() {
  const t = useTranslations("dashboard.passkeys");
  const locale = useLocale();
  const passkeys = useAsyncResource(listPasskeys);
  const rows = passkeys.data ?? [];
  const { pending, run } = useAuthAction<`add:${Attachment}` | `delete:${string}` | "rename">();
  const [pendingDelete, setPendingDelete] = React.useState<PasskeyRow | null>(
    null,
  );
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draftName, setDraftName] = React.useState("");
  const adding = pending?.startsWith("add:") ?? false;
  const savingName = pending === "rename";

  React.useEffect(() => {
    if (passkeys.error) toast.error(t("loadError"));
  }, [passkeys.error, t]);

  function handleAdd(attachment: Attachment) {
    return run(`add:${attachment}`, {
      call: () =>
        authClient.passkey.addPasskey({
          name: t("defaultName"),
          authenticatorAttachment: attachment,
        }),
      success: t("added"),
      error: t("addError"),
      onError: (error) => {
        if (isRegistrationCancelled(error)) return true;
        if (needsRecentSignIn(error)) {
          // Adding a passkey needs a sign-in from the last 10 minutes (see the auth hooks).
          toast.error(t("signInAgainToAdd"), {
            action: { label: t("signInAgain"), onClick: () => void signInAgain(locale) },
          });
          return true;
        }
        return false;
      },
      onSuccess: passkeys.reload,
    });
  }

  async function confirmDelete() {
    const row = pendingDelete;
    if (!row) return;
    await run(`delete:${row.id}`, {
      call: () => authClient.passkey.deletePasskey({ id: row.id }),
      success: t("deleted"),
      error: t("deleteError"),
      onSuccess: passkeys.reload,
    });
    setPendingDelete(null);
  }

  function startRename(row: PasskeyRow) {
    setEditingId(row.id);
    setDraftName(row.name?.trim() ? row.name : t("defaultName"));
  }

  async function handleSaveName(id: string) {
    const name = draftName.trim();
    if (!name) {
      toast.error(t("nameRequired"));
      return;
    }
    await run("rename", {
      call: () => authClient.passkey.updatePasskey({ id, name }),
      success: t("updated"),
      error: t("updateError"),
      onSuccess: async () => {
        setEditingId(null);
        await passkeys.reload();
      },
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-medium">{t("title")}</h3>
          <FieldDescription>{t("hint")}</FieldDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          {ADD_OPTIONS.map(({ attachment, labelKey }) => (
            <Button
              key={attachment}
              type="button"
              variant="outline"
              size="sm"
              loading={pending === `add:${attachment}`}
              disabled={adding}
              onClick={() => void handleAdd(attachment)}
            >
              {t(labelKey)}
            </Button>
          ))}
        </div>
      </div>

      {passkeys.loading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-12 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead className="hidden sm:table-cell">
                  {t("deviceType")}
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("created")}
                </TableHead>
                <TableHead className="text-right">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="max-w-[min(100%,16rem)] align-top text-sm">
                    {editingId === row.id ? (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          disabled={savingName}
                          aria-label={t("name")}
                        />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            loading={savingName}
                            onClick={() => void handleSaveName(row.id)}
                          >
                            {t("save")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={savingName}
                            onClick={() => setEditingId(null)}
                          >
                            {t("cancel")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <span className="font-medium">
                        {row.name?.trim() ? row.name : t("unnamed")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden align-top text-sm text-muted-foreground sm:table-cell">
                    {row.deviceType || t("none")}
                  </TableCell>
                  <TableCell className="hidden align-top text-sm text-muted-foreground md:table-cell">
                    {row.createdAt.toLocaleString(getHtmlLang(locale as AppLocale), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </TableCell>
                  <TableCell className="text-right align-top">
                    {editingId === row.id ? null : (
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("rename")}
                          onClick={() => startRename(row)}
                        >
                          <Pencil className="size-4" aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("delete")}
                          disabled={pending === `delete:${row.id}`}
                          onClick={() => setPendingDelete(row)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("confirmRemoveTitle")}
        description={t("confirmRemoveBody")}
        cancelLabel={t("cancel")}
        confirmLabel={t("delete")}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
