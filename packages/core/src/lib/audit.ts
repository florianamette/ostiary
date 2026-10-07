import { randomUUID } from "node:crypto";

import { db } from "@ostiary/core/db/index";
import { auditLog } from "@ostiary/core/db/schema";

export type AuditEntry = {
  actor: { id: string; email: string } | null;
  action: string;
  target?: { type: string; id: string; label?: string | null };
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
};

/** Writes an audit entry. Never throws: the action itself already happened. */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLog).values({
      id: randomUUID(),
      actorId: entry.actor?.id ?? null,
      actorEmail: entry.actor?.email ?? null,
      action: entry.action,
      targetType: entry.target?.type ?? null,
      targetId: entry.target?.id ?? null,
      targetLabel: entry.target?.label ?? null,
      metadata: entry.metadata ?? null,
      ipAddress: entry.ipAddress ?? null,
    });
  } catch (error) {
    console.error("audit_log insert failed", error);
  }
}
