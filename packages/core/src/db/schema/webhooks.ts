import { boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

/*
 * Outgoing webhooks. Apps register an HTTPS endpoint and the events they want; each event
 * becomes one `webhook_delivery` row per subscribed endpoint (an outbox), sent right after the
 * request that caused it and retried by the cron route until it succeeds or runs out of attempts.
 */

/** A URL that receives signed event notifications (Standard Webhooks). */
export const webhookEndpoint = pgTable("webhook_endpoint", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  description: text("description"),
  /** Event types sent to this endpoint, e.g. ["user.created", "user.deleted"]. */
  events: jsonb("events").$type<string[]>().notNull(),
  /** The signing secret (`whsec_...`), encrypted with a key derived from BETTER_AUTH_SECRET. */
  secretEncrypted: text("secret_encrypted").notNull(),
  /** The secret replaced by the last rotation: deliveries carry both signatures until it expires. */
  previousSecretEncrypted: text("previous_secret_encrypted"),
  previousSecretExpiresAt: timestamp("previous_secret_expires_at"),
  enabled: boolean("enabled").default(true).notNull(),
  /** Why it is disabled: "manual" (an admin) or "failures" (too many failed attempts in a row). */
  disabledReason: text("disabled_reason"),
  disabledAt: timestamp("disabled_at"),
  /** Failed attempts since the last success. Reset by any 2xx answer. */
  consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
  lastSuccessAt: timestamp("last_success_at"),
  lastFailureAt: timestamp("last_failure_at"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** One event for one endpoint: the outbox row, its attempts so far and the last answer. */
export const webhookDelivery = pgTable(
  "webhook_delivery",
  {
    id: text("id").primaryKey(),
    endpointId: text("endpoint_id")
      .notNull()
      .references(() => webhookEndpoint.id, { onDelete: "cascade" }),
    /** The event id, sent as `webhook-id`: the same for every attempt and every endpoint. */
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    /** The exact JSON body that is signed and sent. */
    payload: text("payload").notNull(),
    /** "pending" (to send or retry), "succeeded" or "failed" (no attempt left). */
    status: text("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    /** When the next attempt is due (pending only). */
    nextAttemptAt: timestamp("next_attempt_at"),
    /** Set while a worker sends it, so the cron and an immediate send never both do. */
    lockedUntil: timestamp("locked_until"),
    lastAttemptAt: timestamp("last_attempt_at"),
    responseStatus: integer("response_status"),
    /** The first characters of the answer, or the network error. */
    responseExcerpt: text("response_excerpt"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("webhookDelivery_due_idx").on(table.status, table.nextAttemptAt),
    index("webhookDelivery_endpoint_idx").on(table.endpointId, table.createdAt),
  ],
);
