import { and, desc, ilike, inArray, like, sql, type SQL } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { auditLog, organization, user } from "@ostiary/core/db/schema";
import type { CsvValue } from "@ostiary/core/lib/csv";
import { containsPattern, readParam, type ListSearchParams } from "@/components/admin/common/list-params";

/** The audit page's area filters: an action prefix (`user.` ...), or every entry. */
export const AUDIT_FILTERS = [
  "all",
  "user",
  "organization",
  "oauth_client",
  "oauth_consent",
  "oauth_resource",
  "api_key",
  "sso_provider",
  "signing_key",
  "webhook",
  "social_provider",
] as const;

export type AuditFilter = (typeof AUDIT_FILTERS)[number];

/** The audit log's area filter and actor search. */
export type AuditListFilters = { type: AuditFilter; actor: string };

/** The filters in the audit page's URL (`?type=`, `?q=`), shared by the page and its CSV export. */
export function readAuditListFilters(query: ListSearchParams): AuditListFilters {
  const type = readParam(query, "type");
  return {
    type: AUDIT_FILTERS.find((f) => f === type) ?? "all",
    actor: readParam(query, "q"),
  };
}

function auditListWhere({ type, actor }: AuditListFilters): SQL | undefined {
  return and(
    type === "all" ? undefined : like(auditLog.action, `${type}.%`),
    actor ? ilike(auditLog.actorEmail, containsPattern(actor)) : undefined,
  );
}

export type AuditRow = typeof auditLog.$inferSelect;

/**
 * One page of the audit log, newest first: `before` (an entry id) continues after that entry
 * (keyset pagination, which stays fast however long the log gets). `older` is the id to pass
 * for the next page, or null on the last one.
 */
export async function listAuditPage(filters: AuditListFilters, before: string, pageSize: number) {
  const cursor = before
    ? sql`(${auditLog.createdAt}, ${auditLog.id}) < (select c.created_at, c.id from ${auditLog} c where c.id = ${before})`
    : undefined;
  const page = await db
    .select()
    .from(auditLog)
    .where(and(auditListWhere(filters), cursor))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(pageSize + 1);
  const rows = page.slice(0, pageSize);
  const older = page.length > pageSize ? rows[rows.length - 1].id : null;
  return { rows, older };
}

/**
 * Hook-recorded entries only carry ids: the current email of each user and name of each
 * organization they point at, by id.
 */
export async function auditTargetLabels(rows: readonly Pick<AuditRow, "targetType" | "targetId">[]) {
  const idsOf = (type: string) => [...new Set(rows.filter((r) => r.targetType === type && r.targetId).map((r) => r.targetId!))];
  const userIds = idsOf("user");
  const orgIds = idsOf("organization");
  const labels = new Map<string, string>();
  if (userIds.length) {
    for (const u of await db.select({ id: user.id, email: user.email }).from(user).where(inArray(user.id, userIds))) labels.set(u.id, u.email);
  }
  if (orgIds.length) {
    for (const o of await db.select({ id: organization.id, name: organization.name }).from(organization).where(inArray(organization.id, orgIds))) labels.set(o.id, o.name);
  }
  return labels;
}

/** What the page shows as an entry's target: the current label, the recorded one, or the id. */
export function auditTargetLabel(row: Pick<AuditRow, "targetId" | "targetLabel">, labels: Map<string, string>): string | null {
  return (row.targetId && labels.get(row.targetId)) || row.targetLabel || row.targetId || null;
}

/** The columns of the audit log CSV export: those the page shows, with ids, and the metadata as JSON. */
export const AUDIT_EXPORT_COLUMNS = [
  "id",
  "createdAt",
  "actorId",
  "actorEmail",
  "action",
  "targetType",
  "targetId",
  "target",
  "ipAddress",
  "metadata",
] as const;

/**
 * Every entry matching the filters, newest first, `batchSize` at a time. Keyset pagination on
 * (created_at, id), the cursor kept as Postgres text so no microseconds are lost to a JavaScript
 * Date; entries written while the export runs are newer than the cursor, so they never shift it.
 */
export async function* auditExportBatches(filters: AuditListFilters, batchSize: number) {
  const where = auditListWhere(filters);
  let cursor: { createdAt: string; id: string } | null = null;
  for (;;) {
    const after: SQL | undefined = cursor
      ? sql`(${auditLog.createdAt}, ${auditLog.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id})`
      : undefined;
    const rows = await db
      .select({ entry: auditLog, cursor: sql<string>`${auditLog.createdAt}::text` })
      .from(auditLog)
      .where(and(where, after))
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(batchSize);
    if (rows.length === 0) return;
    const labels = await auditTargetLabels(rows.map((r) => r.entry));
    yield rows.map(({ entry }) =>
      AUDIT_EXPORT_COLUMNS.map((column): CsvValue => {
        if (column === "target") return auditTargetLabel(entry, labels);
        // jsonb: an object (written as JSON) or, for very old rows, a scalar.
        if (column === "metadata") return entry.metadata as CsvValue;
        return entry[column];
      }),
    );
    if (rows.length < batchSize) return;
    const last: { cursor: string; entry: { id: string } } = rows[rows.length - 1];
    cursor = { createdAt: last.cursor, id: last.entry.id };
  }
}
