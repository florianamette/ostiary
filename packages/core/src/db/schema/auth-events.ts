import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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

/**
 * Browsers an account has signed in from, to email the person when it signs in from another
 * one (lib/security/new-device.ts). The browser keeps a random id in a signed cookie; only its
 * hash is stored. Rows not seen for a while are deleted by the cron route.
 */
export const knownDevice = pgTable(
  "known_device",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** SHA-256 (hex) of the device cookie's value. */
    deviceHash: text("device_hash").notNull(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("known_device_user_device_idx").on(table.userId, table.deviceHash),
    index("known_device_last_seen_at_idx").on(table.lastSeenAt),
  ],
);
