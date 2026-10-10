"use client";

import * as React from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
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
import { authClient } from "@/lib/auth-client";
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

export function DashboardPasskeysSection() {
  const t = useTranslations("dashboard.passkeys");
  const locale = useLocale();
  const [rows, setRows] = React.useState<PasskeyRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [adding, setAdding] = React.useState<"platform" | "cross-platform" | null>(
    null,
  );
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<PasskeyRow | null>(
    null,
  );
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draftName, setDraftName] = React.useState("");
  const [savingName, setSavingName] = React.useState(false);

  const loadPasskeys = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await authClient.passkey.listUserPasskeys();
      if (res.error) {
        toast.error(String(res.error.message ?? t("loadError")));
        setRows([]);
        return;
      }
      const list = Array.isArray(res.data) ? res.data : [];
      setRows(
        list.map((p) => ({
          id: p.id,
          name: p.name,
          createdAt: new Date(p.createdAt),
          deviceType: p.deviceType,
        })),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void loadPasskeys();
  }, [loadPasskeys]);

  async function handleAdd(attachment: "platform" | "cross-platform") {
    setAdding(attachment);
    try {
      const { data, error } = await authClient.passkey.addPasskey({
        name: t("defaultName"),
        authenticatorAttachment: attachment,
      });
      if (error) {
        if (isRegistrationCancelled(error)) return;
        if (needsRecentSignIn(error)) {
          // Adding a passkey needs a sign-in from the last 10 minutes (see the auth hooks).
          toast.error(t("signInAgainToAdd"), {
            action: { label: t("signInAgain"), onClick: () => void signInAgain(locale) },
          });
          return;
        }
        toast.error(String(error.message ?? t("addError")));
        return;
      }
      if (data) {
        toast.success(t("added"));
        void loadPasskeys();
      }
    } finally {
      setAdding(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const { error } = await authClient.passkey.deletePasskey({ id });
      if (error) {
        toast.error(String(error.message ?? t("deleteError")));
        return;
      }
      toast.success(t("deleted"));
      void loadPasskeys();
    } finally {
      setDeletingId(null);
    }
  }

  async function confirmDelete() {
    const row = pendingDelete;
    if (!row) return;
    setPendingDelete(null);
    await handleDelete(row.id);
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
    setSavingName(true);
    try {
      const { error } = await authClient.passkey.updatePasskey({ id, name });
      if (error) {
        toast.error(String(error.message ?? t("updateError")));
        return;
      }
      toast.success(t("updated"));
      setEditingId(null);
      void loadPasskeys();
    } finally {
      setSavingName(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-medium">{t("title")}</h3>
          <FieldDescription>{t("hint")}</FieldDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={adding !== null}
            onClick={() => void handleAdd("platform")}
          >
            {adding === "platform" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {t("addThisDevice")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={adding !== null}
            onClick={() => void handleAdd("cross-platform")}
          >
            {adding === "cross-platform" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {t("addSecurityKey")}
          </Button>
        </div>
      </div>

      {loading ? (
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
                            disabled={savingName}
                            onClick={() => void handleSaveName(row.id)}
                          >
                            {savingName ? (
                              <Loader2
                                className="size-4 animate-spin"
                                aria-hidden
                              />
                            ) : null}
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
                          disabled={deletingId === row.id}
                          onClick={() => setPendingDelete(row)}
                        >
                          {deletingId === row.id ? (
                            <Loader2
                              className="size-4 animate-spin"
                              aria-hidden
                            />
                          ) : (
                            <Trash2 className="size-4" aria-hidden />
                          )}
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
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
