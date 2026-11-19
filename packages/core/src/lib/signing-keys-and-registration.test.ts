import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@ostiary/core/db/schema";

/*
 * Signing key rotation and the self-registration cap against a real Postgres (PGlite, every
 * migration applied). Better Auth's key creation is faked: it inserts a key row as the plugin
 * would.
 */

const client = new PGlite();
const testDb = drizzle(client, { schema });
let created = 0;
/** Runs inside the next createJwk, after its key is inserted: another rotation interleaving. */
let duringCreate: (() => Promise<void>) | null = null;

vi.mock("@ostiary/core/db/index", () => ({ db: testDb }));
vi.mock("better-auth/plugins", async (importOriginal) => ({
  ...(await importOriginal<typeof import("better-auth/plugins")>()),
  createJwk: async () => {
    const row = { id: `key_new_${++created}`, publicKey: "pub", privateKey: "priv", createdAt: new Date(), expiresAt: null };
    await testDb.insert(schema.jwks).values(row);
    const interleave = duringCreate;
    duringCreate = null;
    if (interleave) await interleave();
    return row;
  },
}));

const signingKeys = await import("@ostiary/core/lib/signing-keys");
const registration = await import("@ostiary/core/lib/client-registration");
const { DEFAULT_CLIENT_REGISTRATION_SETTINGS } = await import("@ostiary/core/lib/client-registration-policy");

const DAY = 86_400_000;
const context = { getPlugin: () => ({ options: {} }) };

beforeAll(async () => {
  await migrate(drizzle(client), { migrationsFolder: path.resolve(__dirname, "../db/migrations") });
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await testDb.delete(schema.jwks);
  await testDb.delete(schema.oauthClient);
});

const liveKeys = async (now = new Date()) =>
  (await testDb.select().from(schema.jwks)).filter((k) => !k.expiresAt || k.expiresAt > now).map((k) => k.id);

describe("signing key rotation", () => {
  it("creates a key and retires every other live one", async () => {
    const old = new Date(Date.now() - 40 * DAY);
    await testDb.insert(schema.jwks).values([
      { id: "key_a", publicKey: "p", privateKey: "s", createdAt: old },
      { id: "key_b", publicKey: "p", privateKey: "s", createdAt: old, expiresAt: new Date(Date.now() + DAY) },
      { id: "key_gone", publicKey: "p", privateKey: "s", createdAt: old, expiresAt: new Date(Date.now() - DAY) },
    ]);
    const { keyId, retired } = await signingKeys.rotateSigningKey(context, { rotationIntervalDays: 0, gracePeriodDays: 30 });
    expect(retired.sort()).toEqual(["key_a", "key_b"]);
    expect(await liveKeys()).toEqual([keyId]);
  });

  it("leaves exactly one live key after rotations in a row", async () => {
    for (let i = 0; i < 3; i++) await signingKeys.rotateSigningKey(context, { rotationIntervalDays: 0, gracePeriodDays: 30 });
    expect(await liveKeys()).toHaveLength(1);
  });

  it("keeps the newest key live when two rotations interleave", async () => {
    let other: Promise<{ keyId: string }> | null = null;
    // A creates its key; B rotates completely before A retires the others.
    duringCreate = async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      other = signingKeys.rotateSigningKey(context, { rotationIntervalDays: 0, gracePeriodDays: 30 });
      await other;
    };
    await signingKeys.rotateSigningKey(context, { rotationIntervalDays: 0, gracePeriodDays: 30 });
    const newest = (await other!).keyId;
    expect(await liveKeys()).toEqual([newest]);
  });

  it("gives live keys the expiry a new interval implies, and clears it when rotation is turned off", async () => {
    const createdAt = new Date(Date.now() - 10 * DAY);
    await testDb.insert(schema.jwks).values({ id: "key_live", publicKey: "p", privateKey: "s", createdAt });
    await signingKeys.saveSigningKeySettings({ rotationIntervalDays: 30, gracePeriodDays: 7 }, null);
    const [withInterval] = await testDb.select().from(schema.jwks);
    expect(withInterval!.expiresAt!.getTime()).toBe(createdAt.getTime() + 30 * DAY);
    await signingKeys.saveSigningKeySettings({ rotationIntervalDays: 0, gracePeriodDays: 7 }, null);
    const [without] = await testDb.select().from(schema.jwks);
    expect(without!.expiresAt).toBeNull();
  });
});

describe("self-registration cap", () => {
  const settings = (max: number) => ({ ...DEFAULT_CLIENT_REGISTRATION_SETTINGS, maxRegistrationsPerHour: max });

  async function addClient(id: string, opts: { admin?: boolean; minutesAgo?: number; scopes?: string[] } = {}) {
    await testDb.insert(schema.oauthClient).values({
      id,
      clientId: id,
      redirectUris: ["https://app.example.com/cb"],
      adminRegistered: opts.admin ?? false,
      scopes: opts.scopes ?? ["openid"],
      createdAt: new Date(Date.now() - (opts.minutesAgo ?? 1) * 60_000),
    });
  }

  it("counts self-registered clients of the last hour only", async () => {
    await addClient("dyn_1");
    await addClient("dyn_2");
    await addClient("dyn_old", { minutesAgo: 90 });
    await addClient("admin_1", { admin: true });
    expect(await registration.registrationCapacityLeft(settings(3))).toBe(true);
    expect(await registration.registrationCapacityLeft(settings(2))).toBe(false);
  });

  it("narrows self-registered clients' scopes to the allowed list, never admin ones", async () => {
    await addClient("dyn_1", { scopes: ["openid", "orders:write"] });
    await addClient("dyn_2", { scopes: ["openid"] });
    await addClient("admin_1", { admin: true, scopes: ["openid", "orders:write"] });
    expect(await registration.restrictSelfRegisteredScopes(["openid", "profile"])).toBe(1);
    const scopes = Object.fromEntries((await testDb.select().from(schema.oauthClient)).map((c) => [c.clientId, c.scopes]));
    expect(scopes).toEqual({ dyn_1: ["openid"], dyn_2: ["openid"], admin_1: ["openid", "orders:write"] });
  });
});
