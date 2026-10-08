import { bigint, index, integer, pgTable, text } from "drizzle-orm/pg-core";

/**
 * Better Auth's rate limit counters (`rateLimit.storage: "database"`), one row per client IP
 * and endpoint, e.g. `203.0.113.7|/sign-in/email`. Kept in Postgres so every serverless
 * instance sees the same counts. Field names must match Better Auth's `rateLimit` model.
 * Better Auth deletes rows idle for longer than the longest window, see lib/rate-limit.ts.
 */
export const rateLimit = pgTable(
  "rate_limit",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull().unique(),
    count: integer("count").notNull(),
    /** Time of the last counted request, in milliseconds since the epoch. */
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
  },
  // For the cleanup query (`DELETE ... WHERE last_request < cutoff`).
  (table) => [index("rate_limit_last_request_idx").on(table.lastRequest)],
);
