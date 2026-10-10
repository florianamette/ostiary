"use client";

import * as React from "react";

import {
  DEFAULT_ADMIN_TABLE_PAGE_SIZE,
  type AdminTablePageSize,
} from "@ostiary/core/lib/admin/admin-table-page-size";

/**
 * Page state of an admin table showing `total` rows. Goes back to the first page when the page
 * size or one of `filters` changes, and the page is clamped to the last one.
 */
export function usePagination(total: number, filters: string[]) {
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] =
    React.useState<AdminTablePageSize>(DEFAULT_ADMIN_TABLE_PAGE_SIZE);
  const filterKey = filters.join("\u0000");

  React.useEffect(() => {
    setPage(0);
  }, [filterKey, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * pageSize;

  React.useEffect(() => {
    if (page > safePage) setPage(safePage);
  }, [page, safePage]);

  return {
    /** Zero-based, already clamped to `totalPages`. */
    page: safePage,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    pageStart,
    showingFrom: total === 0 ? 0 : pageStart + 1,
    showingTo: Math.min(pageStart + pageSize, total),
  };
}
