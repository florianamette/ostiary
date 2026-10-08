import { beforeEach, describe, expect, it, vi } from "vitest";

const emitted: { type: string; data: Record<string, unknown> }[] = [];
vi.mock("@ostiary/core/lib/webhooks/outbox", () => ({
  emitWebhookEvents: async (events: { type: string; data: Record<string, unknown> }[]) => {
    emitted.push(...events);
  },
}));

const { withWebhookEvents } = await import("@ostiary/core/lib/webhooks/adapter");

type Row = Record<string, unknown>;
type Where = { field: string; value: unknown }[];

/** An in-memory adapter with the methods the wrapper uses. */
function fakeFactory(tables: Record<string, Row[]>) {
  const matches = (row: Row, where: Where = []) => where.every((w) => row[w.field] === w.value);
  const table = (model: string) => (tables[model] ??= []);
  const make = (): Record<string, unknown> => {
    const adapter: Record<string, unknown> = {
      create: async ({ model, data }: { model: string; data: Row }) => {
        const row = { id: `${model}-${table(model).length + 1}`, ...data };
        table(model).push(row);
        return row;
      },
      update: async ({ model, where, update }: { model: string; where: Where; update: Row }) => {
        const row = table(model).find((r) => matches(r, where));
        if (!row) return null;
        Object.assign(row, update);
        return { ...row };
      },
      delete: async ({ model, where }: { model: string; where: Where }) => {
        tables[model] = table(model).filter((r) => !matches(r, where));
      },
      deleteMany: async ({ model, where }: { model: string; where: Where }) => {
        const before = table(model).length;
        tables[model] = table(model).filter((r) => !matches(r, where));
        return before - tables[model]!.length;
      },
      findOne: async ({ model, where }: { model: string; where: Where }) => {
        const row = table(model).find((r) => matches(r, where));
        return row ? { ...row } : null;
      },
      findMany: async ({ model, where }: { model: string; where: Where }) => table(model).filter((r) => matches(r, where)).map((r) => ({ ...r })),
      transaction: async (cb: (trx: unknown) => Promise<unknown>) => cb(make()),
    };
    return adapter;
  };
  return (() => make()) as unknown as Parameters<typeof withWebhookEvents>[0];
}

describe("withWebhookEvents", () => {
  beforeEach(() => {
    emitted.length = 0;
  });

  it("turns user and member writes into events, with what changed", async () => {
    const tables: Record<string, Row[]> = {};
    const adapter = withWebhookEvents(fakeFactory(tables))({} as never) as unknown as Record<string, (args: unknown) => Promise<unknown>>;

    await adapter.create!({ model: "user", data: { email: "a@example.com", name: "A", role: "user", banned: false, password: "x" } });
    await adapter.update!({ model: "user", where: [{ field: "id", value: "user-1" }], update: { banned: true } });
    await adapter.update!({ model: "user", where: [{ field: "id", value: "user-1" }], update: { role: "admin" } });
    await adapter.update!({ model: "user", where: [{ field: "id", value: "user-1" }], update: { updatedAt: new Date() } });
    await adapter.create!({ model: "member", data: { organizationId: "o1", userId: "user-1", role: "member" } });
    await adapter.update!({ model: "member", where: [{ field: "id", value: "member-1" }], update: { role: "owner" } });
    await adapter.deleteMany!({ model: "member", where: [{ field: "organizationId", value: "o1" }] });
    await adapter.delete!({ model: "user", where: [{ field: "id", value: "user-1" }] });
    await adapter.create!({ model: "session", data: { userId: "user-1" } });

    expect(emitted.map((e) => e.type)).toEqual([
      "user.created",
      "user.banned",
      "user.role_changed",
      "organization.member.added",
      "organization.member.role_changed",
      "organization.member.removed",
      "user.deleted",
    ]);
    expect(JSON.stringify(emitted)).not.toContain("password");
  });

  it("watches writes made through a transaction's adapter", async () => {
    const adapter = withWebhookEvents(fakeFactory({}))({} as never) as unknown as {
      transaction: (cb: (trx: Record<string, (args: unknown) => Promise<unknown>>) => Promise<unknown>) => Promise<unknown>;
    };
    await adapter.transaction(async (trx) => {
      await trx.create!({ model: "user", data: { email: "b@example.com", name: "B" } });
    });
    expect(emitted.map((e) => e.type)).toEqual(["user.created"]);
  });

  it("sends nothing for an update that matched no row", async () => {
    const adapter = withWebhookEvents(fakeFactory({}))({} as never) as unknown as Record<string, (args: unknown) => Promise<unknown>>;
    await adapter.update!({ model: "user", where: [{ field: "id", value: "nope" }], update: { role: "admin" } });
    await adapter.delete!({ model: "user", where: [{ field: "id", value: "nope" }] });
    expect(emitted).toEqual([]);
  });
});
