import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * API keys (@better-auth/api-key), field for field the plugin's `apikey` model. Ostiary only
 * uses user-owned keys, so `referenceId` is the owner's user id and the row goes with the
 * account. `permissions` holds the one API the key is for and its scopes, as JSON:
 * `{"https://api.example.com": ["orders:read"]}`. `key` is the SHA-256 digest of the key, never
 * the key itself; `start` keeps its first characters to tell keys apart.
 */
export const apikey = pgTable(
  "apikey",
  {
    id: text("id").primaryKey(),
    configId: text("config_id").default("default").notNull(),
    name: text("name"),
    start: text("start"),
    referenceId: text("reference_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    prefix: text("prefix"),
    key: text("key").notNull(),
    refillInterval: integer("refill_interval"),
    refillAmount: integer("refill_amount"),
    lastRefillAt: timestamp("last_refill_at"),
    enabled: boolean("enabled").default(true),
    rateLimitEnabled: boolean("rate_limit_enabled").default(true),
    rateLimitTimeWindow: integer("rate_limit_time_window"),
    rateLimitMax: integer("rate_limit_max"),
    requestCount: integer("request_count").default(0),
    remaining: integer("remaining"),
    lastRequest: timestamp("last_request"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    permissions: text("permissions"),
    metadata: text("metadata"),
  },
  (table) => [
    uniqueIndex("apikey_key_uidx").on(table.key),
    index("apikey_referenceId_idx").on(table.referenceId),
    index("apikey_configId_idx").on(table.configId),
  ],
);
