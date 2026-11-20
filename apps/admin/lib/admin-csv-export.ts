import { csvFilename, csvStream, type CsvValue } from "@ostiary/core/lib/csv";
import type { ListSearchParams } from "@/components/admin/common/list-params";
import type { AdminDownloadContext } from "@/lib/admin-json-route";

/** Rows read from the database at a time. */
export const EXPORT_BATCH_SIZE = 1000;
/** At most this many rows per file; past it the file ends with a `# truncated` line. */
export const EXPORT_MAX_ROWS = 100_000;

/** A request's query string as a page's `searchParams`, so exports read filters like the pages do. */
export function searchParamsOf(request: Request): ListSearchParams {
  const params: ListSearchParams = {};
  const search = new URL(request.url).searchParams;
  for (const key of new Set(search.keys())) {
    const values = search.getAll(key);
    params[key] = values.length === 1 ? values[0] : values;
  }
  return params;
}

/** The export URL for a page's current filters (empty ones left out). */
export function exportHref(path: string, filters: Record<string, string>): string {
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value && value !== "all"));
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * Streams a CSV export as a download (`ostiary-<name>-YYYY-MM-DD.csv`) and records it in the
 * audit log once the stream ends, with the filters, the rows sent, whether the file was cut at
 * EXPORT_MAX_ROWS, and `cancelled` when the download stopped early.
 */
export function csvDownload({
  name,
  header,
  batches,
  audit,
  action,
  filters,
}: {
  name: string;
  header: readonly string[];
  batches: AsyncIterable<readonly (readonly CsvValue[])[]>;
  audit: AdminDownloadContext["audit"];
  action: string;
  filters: Record<string, string>;
}): Response {
  const stream = csvStream({
    header,
    batches,
    maxRows: EXPORT_MAX_ROWS,
    onDone: ({ rows, truncated, completed }) =>
      audit({
        action,
        metadata: {
          filters: Object.fromEntries(Object.entries(filters).filter(([, value]) => value && value !== "all")),
          rows,
          truncated,
          ...(completed ? {} : { cancelled: true }),
        },
      }),
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(name)}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
