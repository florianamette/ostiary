"use client";

import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { AdminCreateUserDialog } from "@/components/admin/users/admin-create-user-dialog";
import { AdminUserRowActions } from "@/components/admin/users/admin-user-row-actions";
import { Alert, AlertDescription, AlertTitle } from "@ostiary/core/components/ui/alert";
import { adminNotify } from "@ostiary/core/lib/admin/admin-notify";
import { Badge } from "@ostiary/core/components/ui/badge";
import { Button } from "@ostiary/core/components/ui/button";
import { Input } from "@ostiary/core/components/ui/input";
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
  ADMIN_TABLE_PAGE_SIZES,
  DEFAULT_ADMIN_TABLE_PAGE_SIZE,
  type AdminTablePageSize,
} from "@ostiary/core/lib/admin/admin-table-page-size";
import { authClient } from "@/lib/auth-client";
import { cn } from "@ostiary/core/lib/utils";

type RoleFilter = "all" | "admin" | "user";

function formatUserDate(
  value: Date | string | undefined | null,
  format: ReturnType<typeof useFormatter>
) {
  if (value == null) return "-";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return format.dateTime(d, { year: "numeric", month: "short", day: "numeric" });
}

type ListUser = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned: boolean | null;
  emailVerified?: boolean | null;
  createdAt?: Date | string | null;
};

export function AdminUsersPanel() {
  const t = useTranslations("admin.pages.users");
  const tc = useTranslations("admin.common");
  const format = useFormatter();
  const { data: sessionWrap } = authClient.useSession();
  const currentUserId = sessionWrap?.user?.id;

  const [searchInput, setSearchInput] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<RoleFilter>("all");
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] =
    React.useState<AdminTablePageSize>(DEFAULT_ADMIN_TABLE_PAGE_SIZE);
  const [users, setUsers] = React.useState<ListUser[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [listError, setListError] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchInput), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  React.useEffect(() => {
    setPage(0);
  }, [debouncedSearch, roleFilter, pageSize]);

  const refetch = React.useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const totalPages = React.useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize]
  );
  const safePage = React.useMemo(
    () => Math.min(page, totalPages - 1),
    [page, totalPages]
  );

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setListError(null);
      const query: {
        limit: number;
        offset: number;
        sortBy?: string;
        sortDirection?: "asc" | "desc";
        searchValue?: string;
        searchField?: "email" | "name";
        searchOperator?: "contains";
        filterField?: string;
        filterOperator?: "eq";
        filterValue?: string;
      } = {
        limit: pageSize,
        offset: safePage * pageSize,
        sortBy: "createdAt",
        sortDirection: "desc",
      };

      const q = debouncedSearch.trim();
      if (q) {
        query.searchValue = q;
        query.searchField = q.includes("@") ? "email" : "name";
        query.searchOperator = "contains";
      }

      if (roleFilter !== "all") {
        query.filterField = "role";
        query.filterOperator = "eq";
        query.filterValue = roleFilter;
      }

      const res = await authClient.admin.listUsers({ query });

      if (cancelled) return;

      if (res.error) {
        setListError(res.error.message ?? t("list.loadErrorFallback"));
        setUsers([]);
        setTotal(0);
        setLoading(false);
        return;
      }

      const data = res.data;
      setUsers((data?.users as ListUser[]) ?? []);
      setTotal(typeof data?.total === "number" ? data.total : 0);
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [safePage, debouncedSearch, roleFilter, refreshKey, pageSize, t]);
  const showingFrom = total === 0 ? 0 : safePage * pageSize + 1;
  const showingTo = Math.min(safePage * pageSize + pageSize, total);

  React.useEffect(() => {
    if (page > safePage) setPage(safePage);
  }, [page, safePage]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder={t("list.searchPlaceholder")}
            className="pl-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label={t("list.searchLabel")}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={roleFilter}
            onValueChange={(v) => setRoleFilter(v as RoleFilter)}
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
          <AdminCreateUserDialog onCreated={refetch} />
        </div>
      </div>

      {listError ? (
        <Alert variant="destructive">
          <AlertTitle>{t("list.loadErrorTitle")}</AlertTitle>
          <AlertDescription>{listError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-xl border border-border/80 bg-card shadow-xs">
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
            {loading ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  {t("list.loading")}
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  {t("list.empty")}
                </TableCell>
              </TableRow>
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
                            user.role?.includes("admin")
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
                        user.role?.includes("admin") ? "default" : "secondary"
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
                    {formatUserDate(user.createdAt, format)}
                  </TableCell>
                  <TableCell className="text-right">
                    <AdminUserRowActions
                      user={user}
                      currentUserId={currentUserId}
                      onChanged={refetch}
                      onNotify={(message, variant = "success") => {
                        adminNotify(
                          message,
                          variant === "error" ? "error" : "success"
                        );
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex flex-col gap-3 border-t px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <p className="text-muted-foreground text-xs sm:text-sm">
            {total === 0
              ? t("list.noUsers")
              : t("list.showing", { from: showingFrom, to: showingTo, total })}
          </p>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground whitespace-nowrap text-xs">
                {t("list.rowsPerPage")}
              </span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) =>
                  setPageSize(Number(v) as AdminTablePageSize)
                }
              >
                <SelectTrigger
                  size="sm"
                  className="w-[88px]"
                  aria-label={t("list.rowsPerPage")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADMIN_TABLE_PAGE_SIZES.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={loading || safePage <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeftIcon />
                {t("list.previous")}
              </Button>
              <span className="text-muted-foreground tabular-nums text-xs sm:text-sm">
                {t("list.pageOf", { page: safePage + 1, pages: totalPages })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={loading || safePage >= totalPages - 1}
                onClick={() =>
                  setPage((p) => Math.min(totalPages - 1, p + 1))
                }
              >
                {t("list.next")}
                <ChevronRightIcon />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        {t.rich("list.poweredBy", {
          code: (chunks) => (
            <code className="rounded bg-muted px-1 py-0.5 font-mono">{chunks}</code>
          ),
          link: (chunks) => (
            <a
              href="https://better-auth.com/docs/plugins/admin"
              className="font-medium text-foreground underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {chunks}
            </a>
          ),
        })}
      </p>
    </div>
  );
}
