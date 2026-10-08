import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@ostiary/core/db/index";
import { webhookDelivery, webhookEndpoint } from "@ostiary/core/db/schema";
import { env } from "@ostiary/core/lib/env";
import { makeEvent, TEST_EVENT_TYPE, type WebhookEvent } from "@ostiary/core/lib/webhooks/events";
import { decryptSecret } from "@ostiary/core/lib/webhooks/secret-box";
import { webhookHeaders } from "@ostiary/core/lib/webhooks/signing";
import { postPinned } from "@ostiary/core/lib/webhooks/transport";
import { checkWebhookUrl } from "@ostiary/core/lib/webhooks/url-safety";

/*
 * Delivery. Each event becomes one `webhook_delivery` row per enabled endpoint that subscribes
 * to it (the outbox), written once the change is committed. The rows are sent right after the
 * response (Next.js `after()`, which Vercel keeps alive with waitUntil), so a slow or broken
 * receiver never slows a sign-up down. A failed attempt is retried by the cron route
 * (/api/cron/webhooks) with exponential backoff: 5 attempts over about a day. An endpoint that
 * fails AUTO_DISABLE_AFTER attempts in a row is disabled, which the console shows.
 */

/** Wait before attempt 2, 3, 4 and 5. Attempt 1 is immediate. */
export const RETRY_DELAYS_MS = [5 * 60_000, 60 * 60_000, 6 * 3_600_000, 18 * 3_600_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
/** Failed attempts in a row (all events together) after which an endpoint is disabled. */
export const AUTO_DISABLE_AFTER = 15;
/** How long a worker may hold a delivery before another may take it again. */
const LOCK_MS = 2 * 60_000;
/** Deliveries are kept this long for the log, then deleted by the cron route. */
export const DELIVERY_RETENTION_DAYS = 30;
/** A rotated secret still signs deliveries this long, so receivers can switch without a gap. */
export const PREVIOUS_SECRET_TTL_MS = 24 * 3_600_000;

const USER_AGENT = "Ostiary-Webhooks/1.0";

type Delivery = typeof webhookDelivery.$inferSelect;
type Endpoint = typeof webhookEndpoint.$inferSelect;

export type DeliveryOutcome = {
  deliveryId: string;
  ok: boolean;
  status: number | null;
  excerpt: string;
  /** Pending again with a retry, or out of attempts. */
  state: "succeeded" | "pending" | "failed";
};

/** Whether http://localhost endpoints are accepted (development only). */
export function webhooksAllowLocalhost(): boolean {
  return env.WEBHOOKS_ALLOW_LOCALHOST === "true" && env.NODE_ENV !== "production";
}

/** Delay before the next attempt once `attempts` have failed, or null when none is left. */
export function nextRetryDelay(attempts: number): number | null {
  return attempts >= 1 && attempts <= RETRY_DELAYS_MS.length ? RETRY_DELAYS_MS[attempts - 1]! : null;
}

/** The secret, and the previous one while it is still valid after a rotation. */
export function signingSecrets(endpoint: Pick<Endpoint, "secretEncrypted" | "previousSecretEncrypted" | "previousSecretExpiresAt">, now = new Date()): string[] {
  const secrets = [decryptSecret(endpoint.secretEncrypted, env.BETTER_AUTH_SECRET)];
  if (endpoint.previousSecretEncrypted && endpoint.previousSecretExpiresAt && endpoint.previousSecretExpiresAt > now) {
    try {
      secrets.push(decryptSecret(endpoint.previousSecretEncrypted, env.BETTER_AUTH_SECRET));
    } catch {
      // An unreadable old secret only drops the second signature.
    }
  }
  return secrets;
}

/**
 * Writes one delivery per subscribed endpoint and returns their ids. Throws on database
 * errors: callers decide how to report them.
 */
export async function enqueueEvents(events: WebhookEvent[], onlyEndpointId?: string): Promise<string[]> {
  if (events.length === 0) return [];
  const endpoints = await db
    .select({ id: webhookEndpoint.id, events: webhookEndpoint.events })
    .from(webhookEndpoint)
    .where(onlyEndpointId ? eq(webhookEndpoint.id, onlyEndpointId) : eq(webhookEndpoint.enabled, true));
  const now = new Date();
  const rows = events.flatMap((event) =>
    endpoints
      .filter((endpoint) => onlyEndpointId || endpoint.events.includes(event.type))
      .map((endpoint) => ({
        id: randomUUID(),
        endpointId: endpoint.id,
        eventId: event.id,
        eventType: event.type,
        payload: JSON.stringify(event),
        status: "pending",
        attempts: 0,
        nextAttemptAt: now,
        createdAt: now,
      })),
  );
  if (rows.length === 0) return [];
  await db.insert(webhookDelivery).values(rows);
  return rows.map((row) => row.id);
}

/** Runs `task` after the response when there is one (request scope), otherwise now in the background. */
function runAfterResponse(task: () => Promise<unknown>) {
  const run = () =>
    task().catch((error: unknown) => {
      console.error("[webhooks] delivery error", error);
    });
  try {
    after(run);
  } catch {
    void run();
  }
}

/**
 * Records events for delivery and sends them after the response. Never throws, so a webhook
 * problem never fails the change that caused it; a failure to record is logged with the event
 * ids (the change itself is already committed).
 */
export async function emitWebhookEvents(events: WebhookEvent[]): Promise<void> {
  if (events.length === 0) return;
  try {
    const ids = await enqueueEvents(events);
    if (ids.length) runAfterResponse(() => deliverNowAndSweep(ids));
  } catch (error) {
    console.error(
      "[webhooks] could not record events, they will not be delivered:",
      events.map((event) => `${event.type} ${event.id}`).join(", "),
      error,
    );
  }
}

/** Last time this instance retried due deliveries on its own (see deliverNowAndSweep). */
let lastSweep = 0;
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Sends new deliveries, then, at most once a minute per instance, a few due retries too. The
 * cron route does that work on schedule; this keeps retries going between runs on a busy
 * instance, which matters where the cron can only run daily (Vercel Hobby).
 */
async function deliverNowAndSweep(ids: string[]) {
  await deliverByIds(ids);
  if (Date.now() - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = Date.now();
  await processDueDeliveries({ budgetMs: 10_000, batch: 10, purge: false });
}

/** Takes due deliveries (optionally only these ids) for this worker, skipping rows another holds. */
async function claim(limit: number, ids?: string[]): Promise<Delivery[]> {
  const now = new Date();
  const due = db
    .select({ id: webhookDelivery.id })
    .from(webhookDelivery)
    .where(
      and(
        eq(webhookDelivery.status, "pending"),
        lte(webhookDelivery.nextAttemptAt, now),
        or(isNull(webhookDelivery.lockedUntil), lt(webhookDelivery.lockedUntil, now)),
        inArray(
          webhookDelivery.endpointId,
          db.select({ id: webhookEndpoint.id }).from(webhookEndpoint).where(eq(webhookEndpoint.enabled, true)),
        ),
        ids ? inArray(webhookDelivery.id, ids) : undefined,
      ),
    )
    .orderBy(asc(webhookDelivery.nextAttemptAt))
    .limit(limit)
    .for("update", { skipLocked: true });
  return db
    .update(webhookDelivery)
    .set({ lockedUntil: new Date(now.getTime() + LOCK_MS) })
    .where(inArray(webhookDelivery.id, due))
    .returning();
}

/** Checks the URL again, signs and POSTs the payload. */
async function send(delivery: Delivery, endpoint: Endpoint, now: Date): Promise<{ ok: boolean; status: number | null; excerpt: string }> {
  const checked = await checkWebhookUrl(endpoint.url, webhooksAllowLocalhost());
  if (!checked.ok) return { ok: false, status: null, excerpt: `Refused: ${checked.error}` };
  let secrets: string[];
  try {
    secrets = signingSecrets(endpoint, now);
  } catch {
    return { ok: false, status: null, excerpt: "The signing secret cannot be read (was BETTER_AUTH_SECRET changed?). Rotate it." };
  }
  const timestamp = Math.floor(now.getTime() / 1000);
  const headers = { ...webhookHeaders(secrets, delivery.eventId, timestamp, delivery.payload), "user-agent": USER_AGENT };
  return postPinned(checked.url, checked.addresses, headers, delivery.payload);
}

/** One attempt: sign, send, record the answer, schedule a retry or give up. */
async function attempt(delivery: Delivery, endpoint: Endpoint): Promise<DeliveryOutcome> {
  const attempts = delivery.attempts + 1;
  const now = new Date();
  const result = await send(delivery, endpoint, now);

  // A test event is sent once: the admin sees the answer straight away.
  const delay = result.ok || delivery.eventType === TEST_EVENT_TYPE ? null : nextRetryDelay(attempts);
  const state: DeliveryOutcome["state"] = result.ok ? "succeeded" : delay !== null ? "pending" : "failed";
  const finished = new Date();
  await db
    .update(webhookDelivery)
    .set({
      status: state,
      attempts,
      lastAttemptAt: finished,
      nextAttemptAt: delay !== null ? new Date(finished.getTime() + delay) : null,
      lockedUntil: null,
      responseStatus: result.status,
      responseExcerpt: result.excerpt || null,
    })
    .where(eq(webhookDelivery.id, delivery.id));

  if (result.ok) {
    await db
      .update(webhookEndpoint)
      .set({ consecutiveFailures: 0, lastSuccessAt: finished })
      .where(eq(webhookEndpoint.id, endpoint.id));
  } else {
    const [updated] = await db
      .update(webhookEndpoint)
      .set({ consecutiveFailures: sql`${webhookEndpoint.consecutiveFailures} + 1`, lastFailureAt: finished })
      .where(eq(webhookEndpoint.id, endpoint.id))
      .returning({ failures: webhookEndpoint.consecutiveFailures });
    if (updated && updated.failures >= AUTO_DISABLE_AFTER) {
      await db
        .update(webhookEndpoint)
        .set({ enabled: false, disabledReason: "failures", disabledAt: finished })
        .where(and(eq(webhookEndpoint.id, endpoint.id), eq(webhookEndpoint.enabled, true)));
    }
  }
  return { deliveryId: delivery.id, ok: result.ok, status: result.status, excerpt: result.excerpt, state };
}

async function deliverClaimed(rows: Delivery[]): Promise<DeliveryOutcome[]> {
  if (rows.length === 0) return [];
  const endpointIds = [...new Set(rows.map((row) => row.endpointId))];
  const endpoints = new Map(
    (await db.select().from(webhookEndpoint).where(inArray(webhookEndpoint.id, endpointIds))).map((e) => [e.id, e]),
  );
  return Promise.all(
    rows.map(async (row) => {
      const endpoint = endpoints.get(row.endpointId);
      if (!endpoint) return { deliveryId: row.id, ok: false, status: null, excerpt: "Endpoint deleted", state: "failed" as const };
      return attempt(row, endpoint);
    }),
  );
}

/** Sends these deliveries now, if they are due and nobody else is sending them. */
export async function deliverByIds(ids: string[]): Promise<DeliveryOutcome[]> {
  if (ids.length === 0) return [];
  return deliverClaimed(await claim(ids.length, ids));
}

/**
 * The cron route's work: sends every due delivery in batches until none is left or the time
 * budget is spent, then deletes old finished deliveries. Returns counts for the response.
 */
export async function processDueDeliveries({ budgetMs = 45_000, batch = 25, purge = true } = {}) {
  const started = Date.now();
  const counts = { attempted: 0, succeeded: 0, retrying: 0, failed: 0, purged: 0 };
  while (Date.now() - started < budgetMs) {
    const rows = await claim(batch);
    if (rows.length === 0) break;
    for (const outcome of await deliverClaimed(rows)) {
      counts.attempted++;
      counts[outcome.state === "succeeded" ? "succeeded" : outcome.state === "pending" ? "retrying" : "failed"]++;
    }
  }
  if (!purge) return counts;
  const cutoff = new Date(Date.now() - DELIVERY_RETENTION_DAYS * 86_400_000);
  const purged = await db
    .delete(webhookDelivery)
    .where(and(ne(webhookDelivery.status, "pending"), lt(webhookDelivery.createdAt, cutoff)))
    .returning({ id: webhookDelivery.id });
  counts.purged = purged.length;
  return counts;
}

/** Sends a `webhook.test` event to one enabled endpoint and waits for the answer. */
export async function sendTestEvent(endpointId: string): Promise<DeliveryOutcome | null> {
  const event = makeEvent(TEST_EVENT_TYPE, { message: "Test event from Ostiary. It changes nothing." });
  const ids = await enqueueEvents([event], endpointId);
  const [outcome] = await deliverByIds(ids);
  return outcome ?? null;
}

/** Sends a delivery's event again as a new delivery (same event id), and waits for the answer. */
export async function redeliver(deliveryId: string): Promise<DeliveryOutcome | null> {
  const [original] = await db.select().from(webhookDelivery).where(eq(webhookDelivery.id, deliveryId));
  if (!original) return null;
  const now = new Date();
  const id = randomUUID();
  await db.insert(webhookDelivery).values({
    id,
    endpointId: original.endpointId,
    eventId: original.eventId,
    eventType: original.eventType,
    payload: original.payload,
    status: "pending",
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
  });
  const [outcome] = await deliverByIds([id]);
  return outcome ?? null;
}
