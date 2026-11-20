import { adminDownloadRoute } from "@/lib/admin-json-route";
import { csvDownload, EXPORT_BATCH_SIZE, searchParamsOf } from "@/lib/admin-csv-export";
import { readUserListFilters, USER_EXPORT_COLUMNS, userExportBatches } from "@/lib/user-list";

export const dynamic = "force-dynamic";

/**
 * The users list as CSV, with the Users page's search and role filter (`?q=`, `?role=`).
 * Platform admins only; audited as `user.export_csv`.
 */
export const GET = adminDownloadRoute(async ({ request, audit }) => {
  const filters = readUserListFilters(searchParamsOf(request));
  return csvDownload({
    name: "users",
    header: USER_EXPORT_COLUMNS,
    batches: userExportBatches(filters, EXPORT_BATCH_SIZE),
    audit,
    action: "user.export_csv",
    filters: { q: filters.search, role: filters.role },
  });
});
