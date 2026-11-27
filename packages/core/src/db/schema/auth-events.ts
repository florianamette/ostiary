import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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

/**
 * A person's own security history, for "Recent activity" on their account page
 * (lib/account-activity.ts): sign-ins, password, email, two-factor and passkey changes, and
 * sessions signed out. Separate from auth_event, which counts for the admin charts. Kept as long
 * as sign-in events (AUTH_EVENT_RETENTION_DAYS), deleted with the account.
 */
export const accountEvent = pgTable(
  "account_event",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    /** For a sign-in: the session it started, to sign it out while it is open. */
    sessionId: text("session_id"),
    /** For a sign-in: from a browser the account had not used (lib/security/new-device.ts). */
    newDevice: boolean("new_device").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("account_event_user_id_created_at_idx").on(table.userId, table.createdAt),
    index("account_event_created_at_idx").on(table.createdAt),
  ],
);

/**
 * Accounts whose password turned up in a breach (Have I Been Pwned) when they signed in with it,
 * lib/security/password-breach.ts. Until the password changes, app sign-ins and the account page
 * stop at a "Change your password" step. Deleted by any password change or reset.
 */
export const passwordBreach = pgTable("password_breach", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(),
});
