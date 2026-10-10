"use client";

import type * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "lucide-react";

import { Button } from "@ostiary/core/components/ui/button";
import { Input } from "@ostiary/core/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ostiary/core/components/ui/select";
import { TableCell, TableRow } from "@ostiary/core/components/ui/table";
import {
  ADMIN_TABLE_PAGE_SIZES,
  type AdminTablePageSize,
} from "@ostiary/core/lib/admin/admin-table-page-size";

/** The search box above an admin table. */
export function TableSearch({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-sm">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        placeholder={placeholder}
        className="pl-9"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      />
    </div>
  );
}

/** A full-width row for "loading" and "nothing to show". */
export function TableMessageRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={colSpan}
        className="h-24 text-center text-muted-foreground"
      >
        {children}
      </TableCell>
    </TableRow>
  );
}

/** The footer of an admin table: what is shown, rows per page, previous and next page. */
export function TablePagination({
  summary,
  page,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  loading,
  labels,
}: {
  summary: React.ReactNode;
  /** Zero-based, already clamped to `totalPages`. */
  page: number;
  totalPages: number;
  onPageChange: React.Dispatch<React.SetStateAction<number>>;
  pageSize: AdminTablePageSize;
  onPageSizeChange: (size: AdminTablePageSize) => void;
  loading: boolean;
  labels: { rowsPerPage: string; previous: string; next: string; page: string };
}) {
  return (
    <div className="flex flex-col gap-3 border-t px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <p className="text-muted-foreground text-xs sm:text-sm">{summary}</p>
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground whitespace-nowrap text-xs">
            {labels.rowsPerPage}
          </span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v) as AdminTablePageSize)}
          >
            <SelectTrigger
              size="sm"
              className="w-[88px]"
              aria-label={labels.rowsPerPage}
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
            disabled={loading || page <= 0}
            onClick={() => onPageChange((p) => Math.max(0, p - 1))}
          >
            <ChevronLeftIcon />
            {labels.previous}
          </Button>
          <span className="text-muted-foreground tabular-nums text-xs sm:text-sm">
            {labels.page}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || page >= totalPages - 1}
            onClick={() => onPageChange((p) => Math.min(totalPages - 1, p + 1))}
          >
            {labels.next}
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}
