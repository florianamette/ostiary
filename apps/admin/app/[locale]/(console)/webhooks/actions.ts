"use server";

import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { webhookDelivery, webhookEndpoint } from "@ostiary/core/db/schema";
import { env } from "@ostiary/core/lib/env";
import { isWebhookEventType, type WebhookEventType } from "@ostiary/core/lib/webhooks/events";
import {
  PREVIOUS_SECRET_TTL_MS,
  redeliver,
  sendTestEvent,
  webhooksAllowLocalhost,
  type DeliveryOutcome,
} from "@ostiary/core/lib/webhooks/outbox";
import { encryptSecret } from "@ostiary/core/lib/webhooks/secret-box";
import { generateWebhookSecret } from "@ostiary/core/lib/webhooks/signing";
import { checkWebhookUrl } from "@ostiary/core/lib/webhooks/url-safety";
import { adminActor } from "@/lib/admin-audit";

/*
 * Webhook endpoints. The signing secret is returned once, by create and rotate, and stored
 * encrypted; nothing else ever sends it to the browser. URLs are checked (HTTPS, public
 * addresses only) when saved and again before every delivery.
 */

type Result = { ok: true } | { ok: false; error: string };
type SecretResult = { ok: true; secret: string } | { ok: false; error: string };
type SendResult = { ok: true; outcome: DeliveryOutcome } | { ok: false; error: string };

const MAX_ENDPOINTS = 50;
const MAX_DESCRIPTION = 200;

type EndpointInput = { url: string; description: string; events: string[] };

async function parseInput(input: EndpointInput): Promise<{ ok: true; url: string; description: string | null; events: WebhookEventType[] } | { ok: false; error: string }> {
  const events = [...new Set(input.events)].filter(isWebhookEventType);
  if (events.length === 0) return { ok: false, error: "Choose at least one event." };
  const description = input.description.trim().slice(0, MAX_DESCRIPTION) || null;
  const checked = await checkWebhookUrl(input.url, webhooksAllowLocalhost());
  if (!checked.ok) return checked;
  return { ok: true, url: checked.url.toString(), description, events };
}

async function findEndpoint(id: string): Promise<{ url: string; enabled: boolean } | null> {
  const [row] = await db.select({ url: webhookEndpoint.url, enabled: webhookEndpoint.enabled }).from(webhookEndpoint).where(eq(webhookEndpoint.id, id));
  return row ?? null;
}

export async function createWebhook(input: EndpointInput): Promise<SecretResult & { id?: string }> {
  const { audit, session } = await adminActor();
  const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(webhookEndpoint);
  if (total >= MAX_ENDPOINTS) return { ok: false, error: `At most ${MAX_ENDPOINTS} endpoints.` };
  const parsed = await parseInput(input);
  if (!parsed.ok) return parsed;
  const secret = generateWebhookSecret();
  const id = randomUUID();
  await db.insert(webhookEndpoint).values({
    id,
    url: parsed.url,
    description: parsed.description,
    events: parsed.events,
    secretEncrypted: encryptSecret(secret, env.BETTER_AUTH_SECRET),
    createdBy: session.user.id,
  });
  await audit({ action: "webhook.create", target: { type: "webhook", id, label: parsed.url }, metadata: { events: parsed.events } });
  return { ok: true, secret, id };
}

export async function updateWebhook(id: string, input: EndpointInput & { enabled: boolean }): Promise<Result> {
  const { audit } = await adminActor();
  const [current] = await db.select().from(webhookEndpoint).where(eq(webhookEndpoint.id, id));
  if (!current) return { ok: false, error: "Endpoint not found." };
  const parsed = await parseInput(input);
  if (!parsed.ok) return parsed;
  const now = new Date();
  const enabling = input.enabled && !current.enabled;
  const disabling = !input.enabled && current.enabled;
  await db
    .update(webhookEndpoint)
    .set({
      url: parsed.url,
      description: parsed.description,
      events: parsed.events,
      enabled: input.enabled,
      updatedAt: now,
      // Turning it back on starts a new failure count; turning it off records that an admin did.
      ...(enabling ? { disabledReason: null, disabledAt: null, consecutiveFailures: 0 } : {}),
      ...(disabling ? { disabledReason: "manual", disabledAt: now } : {}),
    })
    .where(eq(webhookEndpoint.id, id));
  await audit({
    action: enabling ? "webhook.enable" : disabling ? "webhook.disable" : "webhook.update",
    target: { type: "webhook", id, label: parsed.url },
    metadata: { url: parsed.url !== current.url ? parsed.url : undefined, events: parsed.events },
  });
  return { ok: true };
}

export async function deleteWebhook(id: string): Promise<Result> {
  const { audit } = await adminActor();
  const deleted = await db.delete(webhookEndpoint).where(eq(webhookEndpoint.id, id)).returning({ url: webhookEndpoint.url });
  if (deleted.length === 0) return { ok: false, error: "Endpoint not found." };
  await audit({ action: "webhook.delete", target: { type: "webhook", id, label: deleted[0]!.url } });
  return { ok: true };
}

/**
 * Replaces the signing secret. The old one keeps signing (a second signature) for 24 hours, so
 * the receiver can switch to the new secret without rejecting deliveries in between.
 */
export async function rotateWebhookSecret(id: string): Promise<SecretResult> {
  const { audit } = await adminActor();
  const [current] = await db
    .select({ url: webhookEndpoint.url, secretEncrypted: webhookEndpoint.secretEncrypted })
    .from(webhookEndpoint)
    .where(eq(webhookEndpoint.id, id));
  if (!current) return { ok: false, error: "Endpoint not found." };
  const secret = generateWebhookSecret();
  await db
    .update(webhookEndpoint)
    .set({
      secretEncrypted: encryptSecret(secret, env.BETTER_AUTH_SECRET),
      previousSecretEncrypted: current.secretEncrypted,
      previousSecretExpiresAt: new Date(Date.now() + PREVIOUS_SECRET_TTL_MS),
      updatedAt: new Date(),
    })
    .where(eq(webhookEndpoint.id, id));
  await audit({ action: "webhook.rotate_secret", target: { type: "webhook", id, label: current.url } });
  return { ok: true, secret };
}

export async function sendWebhookTest(id: string): Promise<SendResult> {
  const { audit } = await adminActor();
  const endpoint = await findEndpoint(id);
  if (!endpoint) return { ok: false, error: "Endpoint not found." };
  if (!endpoint.enabled) return { ok: false, error: "The endpoint is disabled: turn it on to send a test event." };
  const outcome = await sendTestEvent(id);
  if (!outcome) return { ok: false, error: "The test event could not be sent." };
  await audit({ action: "webhook.test", target: { type: "webhook", id, label: endpoint.url }, metadata: { status: outcome.status ?? "error" } });
  return { ok: true, outcome };
}

export async function redeliverWebhook(deliveryId: string): Promise<SendResult> {
  const { audit } = await adminActor();
  const [delivery] = await db
    .select({ endpointId: webhookDelivery.endpointId, eventId: webhookDelivery.eventId, eventType: webhookDelivery.eventType })
    .from(webhookDelivery)
    .where(eq(webhookDelivery.id, deliveryId));
  if (!delivery) return { ok: false, error: "Delivery not found." };
  const endpoint = await findEndpoint(delivery.endpointId);
  if (!endpoint?.enabled) return { ok: false, error: "The endpoint is disabled: turn it on to redeliver." };
  const outcome = await redeliver(deliveryId);
  if (!outcome) return { ok: false, error: "The event could not be sent." };
  await audit({
    action: "webhook.redeliver",
    target: { type: "webhook", id: delivery.endpointId, label: endpoint.url },
    metadata: { event: delivery.eventId, type: delivery.eventType, status: outcome.status ?? "error" },
  });
  return { ok: true, outcome };
}
