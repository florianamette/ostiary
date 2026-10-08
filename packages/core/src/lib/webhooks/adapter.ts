import type { drizzleAdapter } from "better-auth/adapters/drizzle";
import { queueAfterTransactionHook } from "@better-auth/core/context";

import {
  makeEvent,
  memberRoleEvents,
  memberSnapshot,
  userSnapshot,
  userUpdateEvents,
  type WebhookEvent,
} from "@ostiary/core/lib/webhooks/events";
import { emitWebhookEvents } from "@ostiary/core/lib/webhooks/outbox";

type AdapterFactory = ReturnType<typeof drizzleAdapter>;
type Adapter = ReturnType<AdapterFactory>;
type Row = Record<string, unknown>;
type Where = Parameters<Adapter["findOne"]>[0]["where"];

/** The models whose changes are webhook events. */
const WATCHED = new Set(["user", "member"]);

/**
 * Turns user and membership changes into webhook events, whoever makes them: Better Auth's
 * endpoints (sign-up, admin plugin, organization plugin, SSO), SCIM provisioning and Ostiary's
 * own hooks all write through this adapter. Database hooks would miss the plugins that write
 * with the bare adapter (SCIM, organizations) and only see the new row, not what changed.
 *
 * An update or delete reads the row first, in the same transaction, to tell what changed. The
 * events are recorded once the transaction commits (Better Auth's after-commit queue; at once
 * outside a transaction), so a rolled-back sign-up sends nothing. Writes made with Drizzle
 * directly (the admin console's member actions) call emitWebhookEvents themselves.
 */
export function withWebhookEvents(factory: AdapterFactory): AdapterFactory {
  return (options) => watch(factory(options));
}

function queue(events: WebhookEvent[]) {
  if (events.length === 0) return Promise.resolve();
  return queueAfterTransactionHook(() => emitWebhookEvents(events));
}

function watch(adapter: Adapter): Adapter {
  const original = {
    create: adapter.create.bind(adapter),
    update: adapter.update.bind(adapter),
    delete: adapter.delete.bind(adapter),
    deleteMany: adapter.deleteMany.bind(adapter),
    findOne: adapter.findOne.bind(adapter),
    findMany: adapter.findMany.bind(adapter),
    transaction: adapter.transaction.bind(adapter),
  };
  const findOne = (model: string, where: Where) => original.findOne<Row>({ model, where });

  adapter.create = (async (args: Parameters<Adapter["create"]>[0]) => {
    const created = (await original.create(args)) as Row | null;
    if (created && args.model === "user") await queue([makeEvent("user.created", { user: userSnapshot(created) })]);
    if (created && args.model === "member") await queue([makeEvent("organization.member.added", { member: memberSnapshot(created) })]);
    return created;
  }) as Adapter["create"];

  adapter.update = (async (args: Parameters<Adapter["update"]>[0]) => {
    if (!WATCHED.has(args.model)) return original.update(args);
    const before = await findOne(args.model, args.where);
    const updated = (await original.update(args)) as Row | null;
    if (before && updated) {
      await queue(args.model === "user" ? userUpdateEvents(before, updated) : memberRoleEvents(before, updated));
    }
    return updated;
  }) as Adapter["update"];

  adapter.delete = (async (args: Parameters<Adapter["delete"]>[0]) => {
    if (!WATCHED.has(args.model)) return original.delete(args);
    const before = await findOne(args.model, args.where);
    await original.delete(args);
    if (before) await queue([removedEvent(args.model, before)]);
  }) as Adapter["delete"];

  adapter.deleteMany = (async (args: Parameters<Adapter["deleteMany"]>[0]) => {
    if (!WATCHED.has(args.model)) return original.deleteMany(args);
    const rows = await original.findMany<Row>({ model: args.model, where: args.where });
    const count = await original.deleteMany(args);
    if (count > 0) await queue(rows.map((row) => removedEvent(args.model, row)));
    return count;
  }) as Adapter["deleteMany"];

  // Writes inside a transaction go through the transaction's own adapter: watch it too.
  adapter.transaction = (<R>(callback: (trx: Parameters<Parameters<Adapter["transaction"]>[0]>[0]) => Promise<R>) =>
    original.transaction((trx) => callback(watch(trx as Adapter)))) as Adapter["transaction"];

  return adapter;
}

function removedEvent(model: string, row: Row): WebhookEvent {
  return model === "user"
    ? makeEvent("user.deleted", { user: userSnapshot(row) })
    : makeEvent("organization.member.removed", { member: memberSnapshot(row) });
}
