import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { hashPassword } from "better-auth/crypto";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Identical self-registered public clients, against the real Better Auth configuration
 * (createAuth) and a real Postgres (PGlite, in memory, every migration applied): the reuse on
 * /oauth2/register and the cleanup of duplicates registered before it.
 */

vi.hoisted(() => {
  process.env.REQUIRE_ADMIN_2FA = "false";
});

vi.mock("@ostiary/core/db/index", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@ostiary/core/db/schema");
  const client = new PGlite();
  return { db: drizzle(client, { schema }), client };
});

import * as dbModule from "@ostiary/core/db/index";
import * as schema from "@ostiary/core/db/schema";
import { createAuth } from "@ostiary/core/lib/auth-factory";
import {
  pruneNeverUsedSelfRegisteredClients,
  removeDuplicateSelfRegisteredClients,
} from "@ostiary/core/lib/client-dedupe";
import { listSelfRegisteredClients, saveClientRegistrationSettings } from "@ostiary/core/lib/client-registration";
import { DEFAULT_CLIENT_REGISTRATION_SETTINGS } from "@ostiary/core/lib/client-registration-policy";

const { db } = dbModule;
const pglite = (dbModule as unknown as { client: PGlite }).client;

const BASE = "http://localhost:3000";
const ISSUER = `${BASE}/api/auth`;
let auth: ReturnType<typeof createAuth>;

/** What Claude sends on every connection: no token_endpoint_auth_method (coerced to "none"). */
const claude = {
  client_name: "Claude",
  redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  scope: "openid profile email offline_access",
};

const OPEN = { ...DEFAULT_CLIENT_REGISTRATION_SETTINGS, dynamic: "open" as const, maxRegistrationsPerHour: 1000 };

async function register(body: Record<string, unknown>, headers?: Headers) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("content-type", "application/json");
  const response = await auth.handler(
    new Request(`${ISSUER}/oauth2/register`, { method: "POST", headers: requestHeaders, body: JSON.stringify(body) }),
  );
  expect(response.status, await response.clone().text()).toBe(201);
  return (await response.json()) as Record<string, unknown> & { client_id: string };
}

let seq = 0;

async function signedInUser(): Promise<Headers> {
  const id = `usr_${++seq}`;
  const email = `user-${seq}@example.test`;
  const password = `Pw-${seq}-correct-horse-battery`;
  const now = new Date();
  await db.insert(schema.user).values({ id, email, name: `user ${seq}`, emailVerified: true, createdAt: now, updatedAt: now });
  await db.insert(schema.account).values({
    id: `acc_${seq}`,
    userId: id,
    providerId: "credential",
    accountId: id,
    password: await hashPassword(password),
    createdAt: now,
    updatedAt: now,
  });
  const { headers } = (await auth.api.signInEmail({ body: { email, password }, returnHeaders: true })) as { headers: Headers };
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return new Headers({ cookie, origin: BASE });
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function user(): Promise<string> {
  const id = `usr_tok_${++seq}`;
  const now = new Date();
  await db.insert(schema.user).values({ id, email: `tok-${seq}@example.test`, name: "t", emailVerified: true, createdAt: now, updatedAt: now });
  return id;
}

/** An access token for `clientId`, issued `ago` ms ago and valid for `ttl` ms. */
async function accessToken(clientId: string, ago: number, ttl: number) {
  const createdAt = new Date(Date.now() - ago);
  await db.insert(schema.oauthAccessToken).values({
    id: `at_${++seq}`,
    token: `at_${seq}`,
    clientId,
    userId: await user(),
    createdAt,
    expiresAt: new Date(createdAt.getTime() + ttl),
    scopes: ["openid"],
  });
}

async function refreshToken(clientId: string, ago: number, ttl: number) {
  const createdAt = new Date(Date.now() - ago);
  await db.insert(schema.oauthRefreshToken).values({
    id: `rt_${++seq}`,
    token: `rt_${seq}`,
    clientId,
    userId: await user(),
    createdAt,
    expiresAt: new Date(createdAt.getTime() + ttl),
    scopes: ["openid"],
  });
}

async function consent(clientId: string, ago: number) {
  const at = new Date(Date.now() - ago);
  await db.insert(schema.oauthConsent).values({
    id: `consent_${++seq}`,
    clientId,
    userId: await user(),
    scopes: ["openid"],
    createdAt: at,
    updatedAt: at,
  });
}

async function remaining(clientIds: string[]): Promise<string[]> {
  const rows = await db
    .select({ clientId: schema.oauthClient.clientId })
    .from(schema.oauthClient)
    .where(inArray(schema.oauthClient.clientId, clientIds));
  return rows.map((row) => row.clientId).sort();
}

beforeAll(async () => {
  await migrate(drizzle(pglite), { migrationsFolder: path.resolve(__dirname, "../db/migrations") });
  auth = createAuth({ baseURL: BASE, trustedOrigins: [BASE] });
  await auth.$context;
});

beforeEach(async () => {
  await db.delete(schema.oauthClient);
  await saveClientRegistrationSettings(OPEN, null);
});

afterAll(async () => {
  await saveClientRegistrationSettings(DEFAULT_CLIENT_REGISTRATION_SETTINGS, null);
  await pglite.close();
});

describe("an identical anonymous public registration gets the existing client back", () => {
  it("returns the same client_id with its stored metadata, and creates nothing", async () => {
    const first = await register(claude);
    expect(first.client_secret).toBeUndefined();
    const second = await register(claude);
    const third = await register({ ...claude, redirect_uris: [...claude.redirect_uris] });
    expect(second.client_id).toBe(first.client_id);
    expect(third.client_id).toBe(first.client_id);
    expect(second).toMatchObject({
      client_name: "Claude",
      redirect_uris: claude.redirect_uris,
      token_endpoint_auth_method: "none",
      grant_types: claude.grant_types,
      response_types: ["code"],
      client_id_issued_at: first.client_id_issued_at,
    });
    expect(second.client_secret).toBeUndefined();
    expect((await listSelfRegisteredClients()).filter((c) => c.name === "Claude")).toHaveLength(1);
  });

  it("creates a new client when the redirect URIs or other metadata differ", async () => {
    const first = await register(claude);
    const otherRedirect = await register({ ...claude, redirect_uris: ["https://claude.ai/api/mcp/other_callback"] });
    const otherName = await register({ ...claude, client_name: "mcp-verify" });
    const otherGrants = await register({ ...claude, grant_types: ["authorization_code"] });
    const ids = new Set([first.client_id, otherRedirect.client_id, otherName.client_id, otherGrants.client_id]);
    expect(ids.size).toBe(4);
  });

  it("reuses a client only when its website, terms, privacy links and contacts are the same", async () => {
    const links = {
      client_uri: "https://claude.ai",
      tos_uri: "https://claude.ai/terms",
      policy_uri: "https://claude.ai/privacy",
      contacts: ["support@claude.ai"],
    };
    const first = await register({ ...claude, ...links });
    expect((await register({ ...claude, ...links })).client_id).toBe(first.client_id);
    for (const change of [
      { client_uri: "https://attacker.example" },
      { tos_uri: "https://attacker.example/terms" },
      { policy_uri: "https://attacker.example/privacy" },
      { contacts: ["attacker@example.test"] },
    ]) {
      const other = await register({ ...claude, ...links, ...change });
      expect(other.client_id, JSON.stringify(change)).not.toBe(first.client_id);
      expect(other).toMatchObject(change);
    }
  });

  it("never shows the first registrant's links to a later registration without them", async () => {
    const planted = await register({
      ...claude,
      client_uri: "https://attacker.example",
      tos_uri: "https://attacker.example/terms",
      policy_uri: "https://attacker.example/privacy",
    });
    const real = await register(claude);
    expect(real.client_id).not.toBe(planted.client_id);
    expect(real.client_uri).toBeUndefined();
    expect(real.tos_uri).toBeUndefined();
    expect(real.policy_uri).toBeUndefined();
    expect((await register(claude)).client_id).toBe(real.client_id);
  });

  it("never reuses a confidential client", async () => {
    const headers = await signedInUser();
    const body = { ...claude, token_endpoint_auth_method: "client_secret_basic" };
    const first = await register(body, headers);
    const second = await register(body, headers);
    expect(first.client_secret).toEqual(expect.any(String));
    expect(second.client_secret).toEqual(expect.any(String));
    expect(second.client_id).not.toBe(first.client_id);
  });

  it("does not hand back a disabled client", async () => {
    const first = await register(claude);
    await db.update(schema.oauthClient).set({ disabled: true }).where(eq(schema.oauthClient.clientId, first.client_id));
    expect((await register(claude)).client_id).not.toBe(first.client_id);
  });

  it("creates a new client every time when the setting is off", async () => {
    await saveClientRegistrationSettings({ ...OPEN, reuseIdenticalPublicClients: false }, null);
    const first = await register(claude);
    expect((await register(claude)).client_id).not.toBe(first.client_id);
  });

  it("still requires a session when registration is for signed-in users only", async () => {
    await register(claude);
    await saveClientRegistrationSettings({ ...OPEN, dynamic: "signed_in" }, null);
    const response = await auth.handler(
      new Request(`${ISSUER}/oauth2/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(claude),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("hands back an existing client even once the hourly cap is reached", async () => {
    const first = await register(claude);
    await saveClientRegistrationSettings({ ...OPEN, maxRegistrationsPerHour: 0 }, null);
    expect((await register(claude)).client_id).toBe(first.client_id);
  });
});

describe("removing duplicates registered before", () => {
  /** Registers `count` identical Claude clients, as before the reuse existed. */
  async function duplicates(count: number): Promise<string[]> {
    await saveClientRegistrationSettings({ ...OPEN, reuseIdenticalPublicClients: false }, null);
    const ids: string[] = [];
    for (let i = 0; i < count; i++) ids.push((await register(claude)).client_id);
    await saveClientRegistrationSettings(OPEN, null);
    return ids;
  }

  it("keeps the most recently used client, removes the unused ones and leaves those with live tokens", async () => {
    const [recent, signedIn, refreshed, oldConsent, never] = await duplicates(5);
    const other = (await register({ ...claude, client_name: "mcp-connect-probe" })).client_id;
    await accessToken(recent!, 1 * HOUR, 2 * HOUR); // used an hour ago, still live
    await accessToken(signedIn!, 2 * DAY, 30 * DAY); // older, but a live session
    await refreshToken(refreshed!, 3 * DAY, 30 * DAY); // live refresh token only
    await consent(oldConsent!, 5 * DAY);
    await accessToken(oldConsent!, 5 * DAY, HOUR); // expired

    const report = await removeDuplicateSelfRegisteredClients();
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0]).toMatchObject({ name: "Claude", kept: recent });
    expect(report.groups[0]!.removed.sort()).toEqual([oldConsent!, never!].sort());
    expect(report.groups[0]!.inUse.sort()).toEqual([signedIn!, refreshed!].sort());
    expect(report).toMatchObject({ removed: 2, inUse: 2 });
    expect(await remaining([recent!, signedIn!, refreshed!, oldConsent!, never!, other])).toEqual(
      [recent!, signedIn!, refreshed!, other].sort(),
    );

    // The next connection gets the client that was kept.
    expect((await register(claude)).client_id).toBe(recent);
  });

  it("leaves disabled clients alone: never kept over an enabled copy, never deleted", async () => {
    const [disabledRecent, used, unused, disabledUnused] = await duplicates(4);
    await consent(disabledRecent!, 1 * HOUR); // the most recent use, but disabled below
    await accessToken(used!, 1 * DAY, HOUR); // expired
    await db
      .update(schema.oauthClient)
      .set({ disabled: true })
      .where(inArray(schema.oauthClient.clientId, [disabledRecent!, disabledUnused!]));

    const report = await removeDuplicateSelfRegisteredClients();
    expect(report.groups).toEqual([{ name: "Claude", kept: used, removed: [unused], inUse: [] }]);
    expect(await remaining([disabledRecent!, used!, unused!, disabledUnused!])).toEqual(
      [disabledRecent!, used!, disabledUnused!].sort(),
    );
    expect((await register(claude)).client_id).toBe(used);
  });

  it("does not touch confidential or admin-registered clients", async () => {
    const headers = await signedInUser();
    const body = { ...claude, token_endpoint_auth_method: "client_secret_basic" };
    const confidential = [(await register(body, headers)).client_id, (await register(body, headers)).client_id];
    const report = await removeDuplicateSelfRegisteredClients();
    expect(report.groups).toEqual([]);
    expect(await remaining(confidential)).toEqual([...confidential].sort());
  });

  it("prunes self-registered clients never used after the given days", async () => {
    const [oldUnused, oldUsed, recentUnused] = await duplicates(3);
    const old = new Date(Date.now() - 40 * DAY);
    await db.update(schema.oauthClient).set({ createdAt: old }).where(inArray(schema.oauthClient.clientId, [oldUnused!, oldUsed!]));
    await consent(oldUsed!, 39 * DAY);

    expect(await pruneNeverUsedSelfRegisteredClients(30)).toEqual([oldUnused]);
    expect(await remaining([oldUnused!, oldUsed!, recentUnused!])).toEqual([oldUsed!, recentUnused!].sort());
  });

  it("groups identical clients in the console list", async () => {
    await duplicates(3);
    await register({ ...claude, client_name: "mcp-verify" });
    const keys = (await listSelfRegisteredClients()).map((client) => client.dedupeKey);
    expect(keys.every((key) => key !== null)).toBe(true);
    expect(new Set(keys).size).toBe(2);
  });
});
