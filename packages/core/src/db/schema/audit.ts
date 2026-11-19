import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * Who did what to which account, client, organization or SSO provider, from the admin
 * app or the admin API. The actor's email is copied so entries survive account deletion.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    targetLabel: text("target_label"),
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_log_created_at_idx").on(table.createdAt),
    index("audit_log_target_idx").on(table.targetType, table.targetId),
    // Account deletion nulls actor_id (ON DELETE SET NULL); export and erasure filter on it.
    index("audit_log_actor_id_created_at_idx").on(table.actorId, table.createdAt),
    // The audit page filters by action prefix (`LIKE 'user.%'`).
    index("audit_log_action_prefix_idx").using("btree", sql`${table.action} text_pattern_ops`),
  ],
);
