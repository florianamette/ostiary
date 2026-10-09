import { sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { organization, user } from "./auth";

/**
 * API keys (@better-auth/api-key), field for field the plugin's `apikey` model, plus three
 * Ostiary columns. Keys are owned by a user (`config_id` "default") or by an organization
 * (`config_id` "organization"), and `referenceId` holds the owner's id: the plugin's own model.
 * As `referenceId` can point at either table, it has no foreign key; the generated `user_id`
 * and `organization_id` columns copy it for the matching owner type and carry the foreign keys,
 * so a key still goes with its account or its organization. `created_by` records who created an
 * organization's key; it outlives their membership (and their account: set to null).
 * `permissions` holds the one API the key is for and its scopes, as JSON:
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
    referenceId: text("reference_id").notNull(),
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
    userId: text("user_id")
      .generatedAlwaysAs(sql`CASE WHEN config_id = 'organization' THEN NULL ELSE reference_id END`)
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .generatedAlwaysAs(sql`CASE WHEN config_id = 'organization' THEN reference_id ELSE NULL END`)
      .references(() => organization.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    uniqueIndex("apikey_key_uidx").on(table.key),
    index("apikey_referenceId_idx").on(table.referenceId),
    index("apikey_configId_idx").on(table.configId),
    index("apikey_userId_idx").on(table.userId),
    index("apikey_organizationId_idx").on(table.organizationId),
  ],
);
