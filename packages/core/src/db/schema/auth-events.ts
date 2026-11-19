import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * One row per sign-in, sign-up, sign-out and failed sign-in, for the admin charts. Sessions are
 * deleted on sign-out, so they cannot be counted after the fact; these rows can.
 */
export const authEvent = pgTable(
  "auth_event",
  {
    id: text("id").primaryKey(),
    type: text("type", { enum: ["sign_in", "sign_up", "sign_out", "sign_in_failed"] }).notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    /** For failed sign-ins: the email or username that was tried. */
    identifier: text("identifier"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("auth_event_type_created_at_idx").on(table.type, table.createdAt),
    // A user's activity (admin user page) and account deletion (ON DELETE SET NULL).
    index("auth_event_user_id_created_at_idx").on(table.userId, table.createdAt),
    // Failed sign-ins by the email or username tried: export and erasure compare lowercased.
    index("auth_event_identifier_lower_idx").on(sql`lower(${table.identifier})`),
  ],
);
