import type { ListParams } from "@/components/admin/common/use-list-params";

/**
 * Page state of an admin table showing `total` rows, kept in the URL (`?page=`, `?size=`), for
 * lists paginated in the browser and on the server alike (the server reads the same
 * parameters). Changing a filter through useListParams goes back to the first page; the page
 * is clamped to the last one.
 */
export function usePagination(total: number, list: ListParams) {
  const { page, pageSize, setPage, setPageSize, pending } = list;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * pageSize;
  return {
    /** Zero-based, already clamped to `totalPages`. */
    page: safePage,
    setPage,
    pageSize,
    setPageSize,
    /** True while the next page or filter is loading. */
    pending,
    totalPages,
    pageStart,
    showingFrom: total === 0 ? 0 : pageStart + 1,
    showingTo: Math.min(pageStart + pageSize, total),
  };
}
