import { randomUUID } from "node:crypto";

import { SCIM_DEACTIVATED_REASON } from "@ostiary/core/lib/scim";

/*
 * The events apps can subscribe to, and their payloads. A payload carries the event id, its
 * type, when it happened and a small snapshot: ids, email, name, role, organization. Never
 * password hashes, tokens, two-factor secrets or ban notes; the snapshot functions below
 * list each field they copy, so a new column never leaks into webhooks by itself.
 */

export const WEBHOOK_EVENT_TYPES = [
  "user.created",
  "user.updated",
  "user.deleted",
  "user.banned",
  "user.unbanned",
  "user.role_changed",
  "organization.member.added",
  "organization.member.removed",
  "organization.member.role_changed",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/** Sent by "Send test event" only; endpoints do not subscribe to it. */
export const TEST_EVENT_TYPE = "webhook.test";

export function isWebhookEventType(value: string): value is WebhookEventType {
  return (WEBHOOK_EVENT_TYPES as readonly string[]).includes(value);
}

type Row = Record<string, unknown>;

export type UserSnapshot = {
  id: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  username: string | null;
  image: string | null;
  role: string | null;
  banned: boolean;
};

export type MemberSnapshot = {
  id: string;
  organizationId: string;
  userId: string;
  role: string | null;
};

const text = (v: unknown) => (typeof v === "string" ? v : null);

export function userSnapshot(row: Row): UserSnapshot {
  return {
    id: String(row.id),
    email: text(row.email),
    emailVerified: Boolean(row.emailVerified),
    name: text(row.name),
    username: text(row.username),
    image: text(row.image),
    role: text(row.role),
    banned: Boolean(row.banned),
  };
}

export function memberSnapshot(row: Row): MemberSnapshot {
  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    userId: String(row.userId),
    role: text(row.role),
  };
}

export type WebhookEvent = {
  id: string;
  type: WebhookEventType | typeof TEST_EVENT_TYPE;
  timestamp: string;
  data: Record<string, unknown>;
};

export function newEventId(): string {
  return `evt_${randomUUID().replace(/-/g, "")}`;
}

export function makeEvent(type: WebhookEvent["type"], data: Record<string, unknown>, now = new Date()): WebhookEvent {
  return { id: newEventId(), type, timestamp: now.toISOString(), data };
}

/** Profile fields whose change is a `user.updated` event. */
const PROFILE_FIELDS = ["name", "email", "emailVerified", "username", "displayUsername", "image"] as const;

function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return new Date(a as Date).getTime() === new Date(b as Date).getTime();
  }
  return (a ?? null) === (b ?? null);
}

/** Events for a user row going from `before` to `after` (both full rows). */
export function userUpdateEvents(before: Row, after: Row, now = new Date()): WebhookEvent[] {
  const events: WebhookEvent[] = [];
  const user = userSnapshot(after);
  const changes = PROFILE_FIELDS.filter((field) => field in after && !same(before[field], after[field]));
  if (changes.length) {
    events.push(makeEvent("user.updated", { user, changes: [...new Set(changes.map((f) => (f === "displayUsername" ? "username" : f)))] }, now));
  }
  if ("role" in after && !same(before.role, after.role)) {
    events.push(makeEvent("user.role_changed", { user, previousRole: text(before.role) }, now));
  }
  if ("banned" in after && Boolean(before.banned) !== Boolean(after.banned)) {
    if (after.banned) {
      events.push(
        makeEvent(
          "user.banned",
          {
            user,
            // Who banned the account, not why: the reason is an admin's private note.
            source: after.banReason === SCIM_DEACTIVATED_REASON ? "scim" : "admin",
            expiresAt: after.banExpires ? new Date(after.banExpires as Date).toISOString() : null,
          },
          now,
        ),
      );
    } else {
      events.push(makeEvent("user.unbanned", { user, source: before.banReason === SCIM_DEACTIVATED_REASON ? "scim" : "admin" }, now));
    }
  }
  return events;
}

export function memberRoleEvents(before: Row, after: Row, now = new Date()): WebhookEvent[] {
  if (same(before.role, after.role)) return [];
  return [makeEvent("organization.member.role_changed", { member: memberSnapshot(after), previousRole: text(before.role) }, now)];
}
