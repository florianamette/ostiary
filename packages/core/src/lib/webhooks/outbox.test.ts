import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@ostiary/core/db/schema";

/*
 * The delivery state machine (attempt, retry, give up, auto-disable, purge) against a real
 * Postgres (PGlite, every migration applied). The network is faked: each POST answers with
 * the next status in `answers`.
 */

const client = new PGlite();
const testDb = drizzle(client, { schema });
const answers: (number | null)[] = [];

vi.mock("@ostiary/core/db/index", () => ({ db: testDb }));
vi.mock("@ostiary/core/lib/webhooks/url-safety", () => ({
  checkWebhookUrl: async (url: string) => ({ ok: true, url: new URL(url), addresses: ["203.0.113.10"] }),
}));
vi.mock("@ostiary/core/lib/webhooks/transport", () => ({
  postPinned: async () => {
    const status = answers.shift() ?? 500;
    return status === null
      ? { ok: false, status: null, excerpt: "connection refused" }
      : { ok: status >= 200 && status < 300, status, excerpt: "" };
  },
}));

const outbox = await import("@ostiary/core/lib/webhooks/outbox");
const { encryptSecret } = await import("@ostiary/core/lib/webhooks/secret-box");
const { generateWebhookSecret } = await import("@ostiary/core/lib/webhooks/signing");

const DAY = 86_400_000;

beforeAll(async () => {
  await migrate(drizzle(client), { migrationsFolder: path.resolve(__dirname, "../../db/migrations") });
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  answers.length = 0;
  await testDb.delete(schema.webhookDelivery);
  await testDb.delete(schema.webhookEndpoint);
  await testDb.insert(schema.webhookEndpoint).values({
    id: "wh_1",
    url: "https://hooks.example.com/in",
    events: ["user.created"],
    secretEncrypted: encryptSecret(generateWebhookSecret(), process.env.BETTER_AUTH_SECRET!),
  });
});

let seq = 0;
async function pending(overrides: Partial<typeof schema.webhookDelivery.$inferInsert> = {}) {
  const id = `d_${++seq}`;
  const now = new Date();
  await testDb.insert(schema.webhookDelivery).values({
    id,
    endpointId: "wh_1",
    eventId: `evt_${seq}`,
    eventType: "user.created",
    payload: JSON.stringify({ id: `evt_${seq}`, type: "user.created", data: {} }),
    status: "pending",
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    ...overrides,
  });
  return id;
}

const delivery = async (id: string) => (await testDb.select().from(schema.webhookDelivery).where(eq(schema.webhookDelivery.id, id)))[0]!;
const endpoint = async () => (await testDb.select().from(schema.webhookEndpoint).where(eq(schema.webhookEndpoint.id, "wh_1")))[0]!;

describe("webhook delivery", () => {
  it("succeeds and resets the endpoint's run of failures", async () => {
    await testDb.update(schema.webhookEndpoint).set({ consecutiveFailures: 3 });
    const id = await pending();
    answers.push(204);
    expect(await outbox.processDueDeliveries({ purge: false })).toMatchObject({ attempted: 1, succeeded: 1 });
    expect(await delivery(id)).toMatchObject({ status: "succeeded", attempts: 1, responseStatus: 204, nextAttemptAt: null });
    expect(await endpoint()).toMatchObject({ consecutiveFailures: 0 });
  });

  it("schedules a retry after a failure, then gives up after the last attempt", async () => {
    const id = await pending();
    answers.push(500);
    const before = Date.now();
    expect(await outbox.processDueDeliveries({ purge: false })).toMatchObject({ retrying: 1 });
    const retried = await delivery(id);
    expect(retried).toMatchObject({ status: "pending", attempts: 1, responseStatus: 500 });
    // Five minutes before attempt 2: not due yet.
    expect(retried.nextAttemptAt!.getTime()).toBeGreaterThanOrEqual(before + 5 * 60_000 - 1000);
    expect(await outbox.processDueDeliveries({ purge: false })).toMatchObject({ attempted: 0 });

    await testDb.update(schema.webhookDelivery).set({ attempts: outbox.MAX_ATTEMPTS - 1, nextAttemptAt: new Date() });
    answers.push(null);
    expect(await outbox.processDueDeliveries({ purge: false })).toMatchObject({ failed: 1 });
    expect(await delivery(id)).toMatchObject({ status: "failed", attempts: outbox.MAX_ATTEMPTS, nextAttemptAt: null });
  });

  it("disables an endpoint after too many failures in a row, and gives up what was waiting for it", async () => {
    await testDb.update(schema.webhookEndpoint).set({ consecutiveFailures: outbox.AUTO_DISABLE_AFTER - 1 });
    const due = await pending();
    const later = await pending({ nextAttemptAt: new Date(Date.now() + 3_600_000) });
    answers.push(503);
    await outbox.processDueDeliveries({ purge: false });
    expect(await endpoint()).toMatchObject({ enabled: false, disabledReason: "failures", consecutiveFailures: outbox.AUTO_DISABLE_AFTER });
    // Nothing still pending for a disabled endpoint: re-enabling it must not send stale events.
    expect((await delivery(due)).status).toBe("failed");
    expect(await delivery(later)).toMatchObject({ status: "failed", nextAttemptAt: null });
  });

  it("gives up pending deliveries when asked (an admin disables the endpoint)", async () => {
    const a = await pending();
    const done = await pending({ status: "succeeded" });
    expect(await outbox.failPendingDeliveries("wh_1")).toBe(1);
    expect((await delivery(a)).status).toBe("failed");
    expect((await delivery(done)).status).toBe("succeeded");
  });

  it("does not send given-up deliveries once the endpoint is turned back on", async () => {
    const id = await pending();
    await testDb.update(schema.webhookEndpoint).set({ enabled: false });
    await outbox.failPendingDeliveries("wh_1");
    await testDb.update(schema.webhookEndpoint).set({ enabled: true });
    answers.push(200);
    expect(await outbox.processDueDeliveries({ purge: false })).toMatchObject({ attempted: 0 });
    expect(await delivery(id)).toMatchObject({ status: "failed", attempts: 0, responseExcerpt: "Not sent: the endpoint was disabled." });
  });

  it("never sends to a disabled endpoint", async () => {
    await testDb.update(schema.webhookEndpoint).set({ enabled: false });
    const id = await pending();
    expect(await outbox.processDueDeliveries({ purge: false })).toMatchObject({ attempted: 0 });
    expect((await delivery(id)).status).toBe("pending");
  });

  it("purges every delivery older than the retention period, pending ones included", async () => {
    const old = new Date(Date.now() - (outbox.DELIVERY_RETENTION_DAYS + 1) * DAY);
    const stalePending = await pending({ createdAt: old, nextAttemptAt: new Date(Date.now() + DAY) });
    const oldDone = await pending({ createdAt: old, status: "succeeded", nextAttemptAt: null });
    const recent = await pending({ status: "failed", nextAttemptAt: null });
    expect(await outbox.processDueDeliveries()).toMatchObject({ purged: 2 });
    const left = (await testDb.select({ id: schema.webhookDelivery.id }).from(schema.webhookDelivery)).map((r) => r.id);
    expect(left).toEqual([recent]);
    expect(left).not.toContain(stalePending);
    expect(left).not.toContain(oldDone);
  });

  it("redelivers an event in the same row, with a fresh set of attempts", async () => {
    const id = await pending({ status: "failed", attempts: outbox.MAX_ATTEMPTS, nextAttemptAt: null, responseStatus: 500 });
    answers.push(200);
    expect(await outbox.redeliver(id)).toMatchObject({ ok: true, state: "succeeded" });
    expect(await delivery(id)).toMatchObject({ status: "succeeded", attempts: 1, responseStatus: 200 });
    expect(await testDb.select().from(schema.webhookDelivery)).toHaveLength(1);
    expect(await outbox.redeliver("nope")).toBeNull();
  });

  it("sends a test event once, without retries", async () => {
    answers.push(500);
    const outcome = await outbox.sendTestEvent("wh_1");
    expect(outcome).toMatchObject({ ok: false, status: 500, state: "failed" });
  });
});
