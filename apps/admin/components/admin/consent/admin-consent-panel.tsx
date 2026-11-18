"use client";

import { useTranslations } from "next-intl";

import type { OAuthConsentRow } from "@/components/admin/consent/admin-consent-row-actions";
import { ConsentTableRow } from "@/components/admin/consent/consent-table-row";
import { ListSearch, TableMessageRow, TablePagination } from "@/components/admin/common/admin-table";
import { useListParams } from "@/components/admin/common/use-list-params";
import { usePagination } from "@/components/admin/common/use-pagination";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@ostiary/core/components/ui/table";
import { cn } from "@ostiary/core/lib/utils";

/**
 * Every consent on the platform, one page at a time: the server loads it from the URL
 * (`?q=`, `?scope=`, `?page=`, `?size=`), which the search, filter and pages write.
 */
export function AdminConsentPanel({
  consents,
  total,
  filtered,
}: {
  consents: OAuthConsentRow[];
  total: number;
  /** A search or filter is on: an empty page says "no match" rather than "none yet". */
  filtered: boolean;
}) {
  const t = useTranslations("admin.pages.consent.panel");
  const tc = useTranslations("admin.common");
  const list = useListParams();
  const { page, setPage, pageSize, setPageSize, totalPages, showingFrom, showingTo, pending } =
    usePagination(total, list);
  const scopeFilter = list.get("scope") || "all";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <ListSearch list={list} placeholder={t("searchPlaceholder")} label={t("searchLabel")} />
        <Select
          value={scopeFilter}
          onValueChange={(v) => list.set({ scope: v === "all" ? null : v })}
        >
          <SelectTrigger size="sm" className="w-[200px]" aria-label={t("filter.placeholder")}>
            <SelectValue placeholder={t("filter.placeholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filter.all")}</SelectItem>
            <SelectItem value="openid">{t("filter.hasScope", { scope: "openid" })}</SelectItem>
            <SelectItem value="offline">{t("filter.hasScope", { scope: "offline_access" })}</SelectItem>
            <SelectItem value="with_reference">{t("filter.hasScope", { scope: "reference_id" })}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div
        className={cn("rounded-xl border border-border/80 bg-card shadow-xs transition-opacity", pending && "opacity-60")}
        aria-busy={pending}
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[min(26%,240px)]">{t("columns.user")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("columns.application")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("columns.scopes")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("columns.reference")}</TableHead>
              <TableHead className="hidden xl:table-cell">{t("columns.granted")}</TableHead>
              <TableHead className="hidden xl:table-cell">{t("columns.updated")}</TableHead>
              <TableHead className="w-12 text-right">{tc("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {consents.length === 0 ? (
              <TableMessageRow colSpan={7}>{filtered ? t("emptyFiltered") : t("emptyNone")}</TableMessageRow>
            ) : (
              consents.map((row) => <ConsentTableRow key={row.id} row={row} />)
            )}
          </TableBody>
        </Table>

        <TablePagination
          summary={total === 0 ? t("noResults") : t("showing", { from: showingFrom, to: showingTo, total })}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          loading={pending}
          labels={{
            rowsPerPage: t("rowsPerPage"),
            previous: t("previous"),
            next: t("next"),
            page: t("pageOf", { page: page + 1, total: totalPages }),
          }}
        />
      </div>
    </div>
  );
}
