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
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("auth_event_type_created_at_idx").on(table.type, table.createdAt)],
);
