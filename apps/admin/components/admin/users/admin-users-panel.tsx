"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { AdminCreateUserDialog } from "@/components/admin/users/admin-create-user-dialog";
import { AdminUserRowActions } from "@/components/admin/users/admin-user-row-actions";
import { ListSearch, TableMessageRow, TablePagination } from "@/components/admin/common/admin-table";
import { useListParams } from "@/components/admin/common/use-list-params";
import { usePagination } from "@/components/admin/common/use-pagination";
import { ExternalLink } from "@/components/admin/common/external-link";
import { formatShortDate } from "@/components/admin/common/page-header";
import { Badge } from "@ostiary/core/components/ui/badge";
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
import { isPlatformAdmin } from "@ostiary/core/lib/admin/user-has-admin-role";
import { cn } from "@ostiary/core/lib/utils";

type ListUser = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  banned: boolean | null;
  emailVerified: boolean;
  createdAt: string;
};

/**
 * One page of users, loaded on the server from the URL (`?q=`, `?role=`, `?page=`, `?size=`).
 * The search, role filter and page write the URL, which loads the next page.
 */
export function AdminUsersPanel({
  users,
  total,
  currentUserId,
}: {
  users: ListUser[];
  total: number;
  currentUserId: string;
}) {
  const t = useTranslations("admin.pages.users");
  const tc = useTranslations("admin.common");
  const format = useFormatter();
  const router = useRouter();
  const list = useListParams();
  const { page, setPage, pageSize, setPageSize, totalPages, showingFrom, showingTo, pending } =
    usePagination(total, list);
  const roleFilter = list.get("role") || "all";
  const refresh = React.useCallback(() => router.refresh(), [router]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <ListSearch
          list={list}
          placeholder={t("list.searchPlaceholder")}
          label={t("list.searchLabel")}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={roleFilter}
            onValueChange={(v) => list.set({ role: v === "all" ? null : v })}
          >
            <SelectTrigger size="sm" className="w-[140px]">
              <SelectValue placeholder={t("list.rolePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("list.roleAll")}</SelectItem>
              <SelectItem value="admin">{t("list.roleAdmin")}</SelectItem>
              <SelectItem value="user">{t("list.roleUser")}</SelectItem>
            </SelectContent>
          </Select>
          <AdminCreateUserDialog onCreated={refresh} />
        </div>
      </div>

      <div
        className={cn("rounded-xl border border-border/80 bg-card shadow-xs transition-opacity", pending && "opacity-60")}
        aria-busy={pending}
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[min(28%,220px)]">{t("list.columns.user")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("list.columns.role")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("list.columns.status")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("list.columns.verified")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("list.columns.joined")}</TableHead>
              <TableHead className="w-12 text-right">{tc("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableMessageRow colSpan={6}>{t("list.empty")}</TableMessageRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <Link href={`/users/${user.id}`} className="font-medium underline-offset-4 hover:underline">
                        {user.name}
                      </Link>
                      <span className="text-muted-foreground text-xs">
                        {user.email}
                      </span>
                      <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                        <Badge
                          variant={
                            isPlatformAdmin(user.role)
                              ? "default"
                              : "secondary"
                          }
                          className="max-w-full truncate text-xs"
                        >
                          {user.role || "user"}
                        </Badge>
                        {user.banned ? (
                          <Badge variant="destructive" className="text-xs">
                            {t("status.banned")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            {t("status.active")}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge
                      variant={
                        isPlatformAdmin(user.role) ? "default" : "secondary"
                      }
                      className="max-w-[180px] truncate"
                    >
                      {user.role || "user"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {user.banned ? (
                      <Badge variant="destructive">{t("status.banned")}</Badge>
                    ) : (
                      <Badge variant="outline" className="font-normal">
                        {t("status.active")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span
                      className={cn(
                        "text-sm",
                        user.emailVerified
                          ? "text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {user.emailVerified ? tc("yes") : tc("no")}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-sm lg:table-cell">
                    {formatShortDate(user.createdAt, format)}
                  </TableCell>
                  <TableCell className="text-right">
                    <AdminUserRowActions
                      user={user}
                      currentUserId={currentUserId}
                      onChanged={refresh}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <TablePagination
          summary={
            total === 0
              ? t("list.noUsers")
              : t("list.showing", { from: showingFrom, to: showingTo, total })
          }
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          loading={pending}
          labels={{
            rowsPerPage: t("list.rowsPerPage"),
            previous: t("list.previous"),
            next: t("list.next"),
            page: t("list.pageOf", { page: page + 1, pages: totalPages }),
          }}
        />
      </div>

      <p className="text-muted-foreground text-xs">
        {t.rich("list.poweredBy", {
          code: (chunks) => (
            <code className="rounded bg-muted px-1 py-0.5 font-mono">{chunks}</code>
          ),
          link: (chunks) => (
            <ExternalLink href="https://better-auth.com/docs/plugins/admin">{chunks}</ExternalLink>
          ),
        })}
      </p>
    </div>
  );
}
