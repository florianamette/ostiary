import { adminDownloadRoute } from "@/lib/admin-json-route";
import { csvDownload, EXPORT_BATCH_SIZE, searchParamsOf } from "@/lib/admin-csv-export";
import { AUDIT_EXPORT_COLUMNS, auditExportBatches, readAuditListFilters } from "@/lib/audit-list";

export const dynamic = "force-dynamic";

/**
 * The audit log as CSV, with the Audit page's area filter and actor search (`?type=`, `?q=`),
 * all of it rather than one page. Platform admins only; audited as `audit_log.export_csv`.
 */
export const GET = adminDownloadRoute(async ({ request, audit }) => {
  const filters = readAuditListFilters(searchParamsOf(request));
  return csvDownload({
    name: "audit-log",
    header: AUDIT_EXPORT_COLUMNS,
    batches: auditExportBatches(filters, EXPORT_BATCH_SIZE),
    audit,
    action: "audit_log.export_csv",
    filters: { type: filters.type, q: filters.actor },
  });
});
