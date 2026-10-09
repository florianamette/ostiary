"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@ostiary/core/components/ui/badge";
import { Button } from "@ostiary/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ostiary/core/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ostiary/core/components/ui/table";
import { adminRevokeApiKey } from "@/app/[locale]/(console)/api-keys/actions";
import { formatDateTime } from "@/components/admin/common/page-header";
import { Link } from "@/i18n/navigation";

export type AdminApiKeyRow = {
  id: string;
  name: string;
  start: string | null;
  api: string | null;
  apiName: string | null;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  /** The user or organization owning the key, labelled by email or name. */
  owner: { type: "user" | "organization"; id: string; label: string };
  /** Organization keys: the member who created it, while that account exists. */
  createdBy: { id: string; email: string } | null;
};

/** Keys with their owner (a user or an organization), API, scopes and dates, and a revoke button. */
export function ApiKeysTable({
  rows,
  locale,
  showOwner = true,
}: {
  rows: AdminApiKeyRow[];
  locale: string;
  showOwner?: boolean;
}) {
  const t = useTranslations("admin.pages.apiKeys.table");
  const tc = useTranslations("admin.common");
  const router = useRouter();
  const [pending, setPending] = React.useState<AdminApiKeyRow | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const now = Date.now();

  async function revoke() {
    const row = pending;
    if (!row) return;
    setPending(null);
    setBusyId(row.id);
    try {
      const res = await adminRevokeApiKey(row.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(t("revoked"));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t("empty")}</p>;

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("key")}</TableHead>
              {showOwner ? <TableHead>{t("owner")}</TableHead> : null}
              <TableHead>{t("api")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("scopes")}</TableHead>
              <TableHead className="hidden md:table-cell">{tc("created")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("lastUsed")}</TableHead>
              <TableHead>{t("expires")}</TableHead>
              <TableHead className="text-right">{tc("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const expired = row.expiresAt !== null && new Date(row.expiresAt).getTime() <= now;
              return (
                <TableRow key={row.id}>
                  <TableCell className="max-w-[14rem] text-sm">
                    <span className="block truncate font-medium">{row.name}</span>
                    {row.start ? <code className="font-mono text-xs text-muted-foreground">{row.start}…</code> : null}
                    {!showOwner && row.createdBy ? (
                      <span className="block truncate text-xs text-muted-foreground">{t("createdBy", { email: row.createdBy.email })}</span>
                    ) : null}
                  </TableCell>
                  {showOwner ? (
                    <TableCell className="max-w-[14rem] text-sm">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {row.owner.type === "organization" ? (
                          <Badge variant="outline" className="shrink-0">
                            {t("org")}
                          </Badge>
                        ) : null}
                        <Link
                          href={row.owner.type === "organization" ? `/organizations/${row.owner.id}` : `/users/${row.owner.id}`}
                          className="truncate underline-offset-4 hover:underline"
                        >
                          {row.owner.label}
                        </Link>
                      </span>
                      {row.createdBy ? (
                        <span className="block truncate text-xs text-muted-foreground">{t("createdBy", { email: row.createdBy.email })}</span>
                      ) : null}
                    </TableCell>
                  ) : null}
                  <TableCell className="max-w-[14rem] text-sm">
                    <span className="block truncate">{row.apiName ?? t("removedApi")}</span>
                    {row.api ? <span className="block truncate font-mono text-xs text-muted-foreground">{row.api}</span> : null}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex max-w-[16rem] flex-wrap gap-1">
                      {row.scopes.map((scope) => (
                        <Badge key={scope} variant="secondary" className="font-mono font-normal">
                          {scope}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground md:table-cell">
                    {formatDateTime(row.createdAt, locale)}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground md:table-cell">
                    {row.lastUsedAt ? formatDateTime(row.lastUsedAt, locale) : tc("never")}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {expired ? <Badge variant="destructive">{t("expired")}</Badge> : formatDateTime(row.expiresAt, locale)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button type="button" variant="ghost" size="sm" disabled={busyId === row.id} onClick={() => setPending(row)}>
                      {busyId === row.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                      {t("revoke")}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("revokeTitle", { name: pending?.name ?? "" })}</DialogTitle>
            <DialogDescription>
              {pending?.owner.type === "organization"
                ? t("revokeOrgDescription", { owner: pending.owner.label })
                : t("revokeUserDescription", { owner: pending?.owner.label ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPending(null)}>
              {tc("cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={() => void revoke()}>
              {t("revoke")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
