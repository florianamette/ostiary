import {
  ADMIN_TABLE_PAGE_SIZES,
  DEFAULT_ADMIN_TABLE_PAGE_SIZE,
  type AdminTablePageSize,
} from "@ostiary/core/lib/admin/admin-table-page-size";

/**
 * The state of an admin list lives in its URL (`?q=…&page=2&size=500&role=admin`), so going
 * back from a detail page, reloading or sharing the link keeps the search, filters and page.
 * These read it, on the server (a page's `searchParams`) and in the browser (useListParams).
 */
export type ListSearchParams = Record<string, string | string[] | undefined>;

/** The first value of `key`, trimmed; "" when absent. */
export function readParam(params: ListSearchParams, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

/** `key` when it is one of `allowed`, otherwise `fallback`. */
export function readChoice<T extends string>(
  params: ListSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = readParam(params, key);
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Zero-based page from `?page=` (one-based in the URL). */
export function readPage(params: ListSearchParams): number {
  const page = Number.parseInt(readParam(params, "page"), 10);
  return Number.isFinite(page) && page > 1 ? page - 1 : 0;
}

export function readPageSize(params: ListSearchParams): AdminTablePageSize {
  const size = Number(readParam(params, "size"));
  return (ADMIN_TABLE_PAGE_SIZES as readonly number[]).includes(size)
    ? (size as AdminTablePageSize)
    : DEFAULT_ADMIN_TABLE_PAGE_SIZE;
}

/** Page and page size of a server-paginated list, with the SQL offset. */
export function readPagination(params: ListSearchParams) {
  const page = readPage(params);
  const pageSize = readPageSize(params);
  return { page, pageSize, offset: page * pageSize };
}

/** Escapes `%`, `_` and `\` for a SQL LIKE pattern, and wraps the text in `%…%`. */
export function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
