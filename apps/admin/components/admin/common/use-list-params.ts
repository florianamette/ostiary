"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  readPage,
  readPageSize,
  type ListSearchParams,
} from "@/components/admin/common/list-params";

export type ListParams = ReturnType<typeof useListParams>;

/**
 * Reads and writes an admin list's state in the URL (see list-params.ts). `set` replaces the
 * history entry, so typing in a search box does not fill the back button, and goes back to the
 * first page unless only `page` changes. `pending` is true while the server renders the new
 * list.
 */
export function useListParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  const params = React.useMemo<ListSearchParams>(
    () => Object.fromEntries(searchParams.entries()),
    [searchParams],
  );

  const set = React.useCallback(
    (updates: Record<string, string | number | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, String(value));
      }
      // A new search or filter starts over: from the first page, or the newest entries (`before`
      // is the audit log's cursor).
      if (!("page" in updates)) next.delete("page");
      if (!("before" in updates)) next.delete("before");
      const query = next.toString();
      if (query === searchParams.toString()) return;
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  return {
    /** The value of `key`, or "" when absent. */
    get: (key: string) => searchParams.get(key) ?? "",
    set,
    pending,
    page: readPage(params),
    pageSize: readPageSize(params),
    /** Zero-based; page 0 is left out of the URL. */
    setPage: (page: number) => set({ page: page > 0 ? page + 1 : null }),
    setPageSize: (size: number) => set({ size }),
  };
}
