import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/*
 * OAuth client management against the real Better Auth configuration (createAuth) and a real
 * Postgres (PGlite, in memory, every migration applied). Server-side `auth.api` calls skip
 * `disabledPaths`, so these check Ostiary's own rules (clientPrivileges, clientReference, the
 * client guard and the API scope binding), not only that the HTTP routes are closed.
 */

vi.hoisted(() => {
  // The admin two-factor gate is tested end to end; here admins sign in with a password only.
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
  clientRegistrationSource,
  markAdminRegisteredClient,
  saveClientRegistrationSettings,
} from "@ostiary/core/lib/client-registration";
import { DEFAULT_CLIENT_REGISTRATION_SETTINGS, PLATFORM_CLIENT_REFERENCE } from "@ostiary/core/lib/client-registration-policy";
import { invalidateApiScopes } from "@ostiary/core/lib/oauth-scopes";

const { db } = dbModule;
const pglite = (dbModule as unknown as { client: PGlite }).client;

const BASE = "http://localhost:3000";
const ISSUER = `${BASE}/api/auth`;
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
type Api = Record<string, (input: Record<string, unknown>) => Promise<Record<string, unknown>>>;
// Created once the migrations ran: Better Auth reads the database while it starts.
let auth: ReturnType<typeof createAuth>;
let api: Api;

let seq = 0;

/** A verified user with a password, signed in; returns the headers of their session. */
async function signedIn(role: "admin" | "user"): Promise<{ id: string; headers: Headers }> {
  const email = `${role}-${++seq}@example.test`;
  const password = `Pw-${seq}-correct-horse-battery`;
  const id = `usr_${role}_${seq}`;
  const now = new Date();
  // Written directly: the account itself is not under test (sign-up has its own gates).
  await db.insert(schema.user).values({ id, email, name: `${role} ${seq}`, emailVerified: true, role, createdAt: now, updatedAt: now });
  await db.insert(schema.account).values({
    id: `acc_${seq}`,
    userId: id,
    providerId: "credential",
    accountId: id,
    // Better Auth's default scrypt hash (ctx.password.hash goes through haveIBeenPwned).
    password: await hashPassword(password),
    createdAt: now,
    updatedAt: now,
  });
  const { headers } = (await auth.api.signInEmail({ body: { email, password }, returnHeaders: true })) as { headers: Headers };
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { id, headers: new Headers({ cookie, origin: BASE }) };
}

async function setRole(userId: string, role: string) {
  await db.update(schema.user).set({ role }).where(eq(schema.user.id, userId));
}

/** What the admin console does: Better Auth's server-only create, then the admin marker. */
async function adminClient(headers: Headers, body: Record<string, unknown>, mark = true) {
  const created = await api.adminCreateOAuthClient({
    headers,
    body: { redirect_uris: ["https://app.example.test/cb"], client_name: `app ${++seq}`, ...body },
  });
  const clientId = created.client_id as string;
  if (mark) expect(await markAdminRegisteredClient(clientId)).toBe(true);
  return { clientId, clientSecret: created.client_secret as string | undefined };
}

async function clientRow(clientId: string) {
  const [row] = await db.select().from(schema.oauthClient).where(eq(schema.oauthClient.clientId, clientId));
  return row;
}

function request(pathname: string, init: { method?: string; headers?: HeadersInit; form?: Record<string, string>; json?: unknown } = {}) {
  const headers = new Headers(init.headers);
  let body: string | undefined;
  if (init.form) {
    headers.set("content-type", "application/x-www-form-urlencoded");
    body = new URLSearchParams(init.form).toString();
  } else if (init.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json);
  }
  return auth.handler(new Request(`${ISSUER}${pathname}`, { method: init.method ?? (body ? "POST" : "GET"), headers, body }));
}

const basic = (id: string, secret: string) => `Basic ${Buffer.from(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`).toString("base64")}`;

function jwtPayload(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")) as Record<string, unknown>;
}

/** Expects a server-side call to be refused. */
async function refused(call: Promise<unknown>) {
  await expect(call).rejects.toMatchObject({ statusCode: expect.any(Number) });
}

beforeAll(async () => {
  await migrate(drizzle(pglite), { migrationsFolder: path.resolve(__dirname, "../db/migrations") });
  auth = createAuth({ baseURL: BASE, trustedOrigins: [BASE] });
  api = auth.api as unknown as Api;
  await auth.$context;
});

afterAll(async () => {
  await pglite.close();
});

describe("client management is for platform admins only (H1)", () => {
  it("closes Better Auth's client management endpoints over HTTP", async () => {
    const user = await signedIn("user");
    for (const pathname of ["/oauth2/create-client", "/oauth2/update-client", "/oauth2/client/rotate-secret", "/oauth2/delete-client"]) {
      const response = await request(pathname, { headers: user.headers, json: { client_id: "x", redirect_uris: ["https://evil.example/cb"], update: {} } });
      expect(response.status, pathname).toBe(404);
    }
  });

  it("refuses an ordinary user every client action, even called on the server", async () => {
    const user = await signedIn("user");
    const admin = await signedIn("admin");
    const { clientId } = await adminClient(admin.headers, { token_endpoint_auth_method: "client_secret_basic" });
    await refused(api.createOAuthClient({ headers: user.headers, body: { redirect_uris: ["https://evil.example/cb"], client_name: "Totally Legit" } }));
    await refused(api.adminCreateOAuthClient({ headers: user.headers, body: { redirect_uris: ["https://evil.example/cb"] } }));
    await refused(api.updateOAuthClient({ headers: user.headers, body: { client_id: clientId, update: { client_name: "x" } } }));
    await refused(api.rotateClientSecret({ headers: user.headers, body: { client_id: clientId } }));
    await refused(api.deleteOAuthClient({ headers: user.headers, body: { client_id: clientId } }));
    await refused(api.getOAuthClients({ headers: user.headers, query: {} }));
    expect(await clientRow(clientId)).toBeDefined();
  });

  it("still lets signed-in users self-register when that is on, as self-registered clients", async () => {
    await saveClientRegistrationSettings({ ...DEFAULT_CLIENT_REGISTRATION_SETTINGS, dynamic: "signed_in" }, null);
    try {
      const user = await signedIn("user");
      const response = await request("/oauth2/register", {
        headers: user.headers,
        json: {
          client_name: "agent",
          redirect_uris: ["http://127.0.0.1:33418/callback"],
          token_endpoint_auth_method: "none",
          application_type: "native",
          grant_types: ["authorization_code", "refresh_token"],
        },
      });
      expect(response.status, await response.clone().text()).toBe(201);
      const { client_id: clientId } = (await response.json()) as { client_id: string };
      expect(await clientRegistrationSource(clientId)).toBe("dynamic");
      // ...and get no control over it afterwards.
      await refused(api.updateOAuthClient({ headers: user.headers, body: { client_id: clientId, update: { scope: "openid orders:write" } } }));
    } finally {
      await saveClientRegistrationSettings(DEFAULT_CLIENT_REGISTRATION_SETTINGS, null);
    }
  });

  it("counts a client as admin-registered only once it is marked", async () => {
    const admin = await signedIn("admin");
    const { clientId } = await adminClient(admin.headers, {}, false);
    expect(await clientRegistrationSource(clientId)).toBe("dynamic");
    expect(await markAdminRegisteredClient(clientId)).toBe(true);
    expect(await clientRegistrationSource(clientId)).toBe("admin");
  });
});

describe("admin-registered clients belong to the platform (M6)", () => {
  it("are owned by no single admin", async () => {
    const admin = await signedIn("admin");
    const { clientId } = await adminClient(admin.headers, {});
    expect(await clientRow(clientId)).toMatchObject({ userId: null, referenceId: PLATFORM_CLIENT_REFERENCE, adminRegistered: true });
  });

  it("can be managed by another admin, and not by an admin who lost the role", async () => {
    const creator = await signedIn("admin");
    const other = await signedIn("admin");
    const { clientId } = await adminClient(creator.headers, { token_endpoint_auth_method: "client_secret_basic" });

    const rotated = await api.rotateClientSecret({ headers: other.headers, body: { client_id: clientId } });
    expect(rotated.client_secret).toEqual(expect.any(String));

    await setRole(creator.id, "user");
    await refused(api.adminUpdateOAuthClient({ headers: creator.headers, body: { client_id: clientId, update: { client_name: "mine" } } }));
    await refused(api.updateOAuthClient({ headers: creator.headers, body: { client_id: clientId, update: { client_name: "mine" } } }));
    await refused(api.rotateClientSecret({ headers: creator.headers, body: { client_id: clientId } }));
    await refused(api.deleteOAuthClient({ headers: creator.headers, body: { client_id: clientId } }));
    expect((await clientRow(clientId))?.name).not.toBe("mine");

    await api.deleteOAuthClient({ headers: other.headers, body: { client_id: clientId } });
    expect(await clientRow(clientId)).toBeUndefined();
  });
});

describe("self-registered clients stay within the self-registration policy (M8)", () => {
  it("refuses wider scopes, other grants and skipping consent on update", async () => {
    const admin = await signedIn("admin");
    // Not marked: what a self-registered client looks like, here owned by the platform.
    const { clientId } = await adminClient(admin.headers, { token_endpoint_auth_method: "none", scope: "openid profile" }, false);
    for (const update of [
      { scope: "openid orders:write" },
      { grant_types: ["authorization_code", "client_credentials"] },
      { grant_types: ["authorization_code", DEVICE_GRANT] },
      { skip_consent: true },
    ]) {
      await expect(
        api.adminUpdateOAuthClient({ headers: admin.headers, body: { client_id: clientId, update } }),
        JSON.stringify(update),
      ).rejects.toMatchObject({ body: { error: "invalid_client_metadata" } });
    }
    const row = await clientRow(clientId);
    expect(row?.scopes).toEqual(["openid", "profile"]);
    expect(row?.skipConsent).not.toBe(true);

    await api.adminUpdateOAuthClient({ headers: admin.headers, body: { client_id: clientId, update: { client_name: "renamed", scope: "openid email" } } });
    expect(await clientRow(clientId)).toMatchObject({ name: "renamed", scopes: ["openid", "email"] });
  });

  it("leaves admin-registered clients alone", async () => {
    const admin = await signedIn("admin");
    const { clientId } = await adminClient(admin.headers, { token_endpoint_auth_method: "client_secret_basic" });
    await api.adminUpdateOAuthClient({ headers: admin.headers, body: { client_id: clientId, update: { scope: "openid orders:write", skip_consent: true } } });
    expect(await clientRow(clientId)).toMatchObject({ scopes: ["openid", "orders:write"], skipConsent: true });
  });
});

describe("device sign-in is for admin-registered clients, however they authenticate (L4)", () => {
  async function deviceClient(mark: boolean) {
    const admin = await signedIn("admin");
    return adminClient(admin.headers, { token_endpoint_auth_method: "client_secret_basic", grant_types: [DEVICE_GRANT], scope: "openid" }, mark);
  }

  it("refuses a self-registered client authenticating with HTTP Basic and no client_id", async () => {
    const { clientId, clientSecret } = await deviceClient(false);
    const response = await request("/device/code", { headers: { authorization: basic(clientId, clientSecret!) }, form: { scope: "openid" } });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "unauthorized_client" });
  });

  it("refuses it by client_id too", async () => {
    const { clientId, clientSecret } = await deviceClient(false);
    const response = await request("/device/code", { headers: { authorization: basic(clientId, clientSecret!) }, form: { client_id: clientId, scope: "openid" } });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "unauthorized_client" });
  });

  it("issues codes to admin-registered clients with HTTP Basic", async () => {
    const { clientId, clientSecret } = await deviceClient(true);
    const response = await request("/device/code", { headers: { authorization: basic(clientId, clientSecret!) }, form: { scope: "openid" } });
    expect(response.status, await response.clone().text()).toBe(200);
    expect(await response.json()).toMatchObject({ device_code: expect.any(String), user_code: expect.any(String) });
  });

  it("refuses to exchange a device code issued to a client that is not admin-registered", async () => {
    const { clientId, clientSecret } = await deviceClient(true);
    const issued = await request("/device/code", { headers: { authorization: basic(clientId, clientSecret!) }, form: { scope: "openid" } });
    const { device_code: code } = (await issued.json()) as { device_code: string };
    // The client loses its admin status after the code was issued.
    await db.update(schema.oauthClient).set({ adminRegistered: false }).where(eq(schema.oauthClient.clientId, clientId));
    const response = await request("/oauth2/token", {
      headers: { authorization: basic(clientId, clientSecret!) },
      form: { grant_type: DEVICE_GRANT, device_code: code },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "unauthorized_client" });
  });
});

describe("API scopes are only issued for their own API (L5)", () => {
  const A = "https://a.api.example.test";
  const B = "https://b.api.example.test";
  const R = "https://restricted.api.example.test";

  beforeAll(async () => {
    const now = new Date();
    await db.insert(schema.oauthResource).values([
      { id: "res_a", identifier: A, name: "A", metadata: { scopes: ["a:read", "a:write"] }, createdAt: now, updatedAt: now },
      { id: "res_b", identifier: B, name: "B", metadata: { scopes: ["b:read"] }, createdAt: now, updatedAt: now },
      { id: "res_r", identifier: R, name: "R", metadata: { scopes: ["r:read"] }, allowedScopes: ["openid", "r:read"], createdAt: now, updatedAt: now },
    ]);
    invalidateApiScopes();
  });

  async function machineClient() {
    const admin = await signedIn("admin");
    const scope = "a:read a:write b:read r:read orders:write";
    return adminClient(admin.headers, {
      token_endpoint_auth_method: "client_secret_basic",
      grant_types: ["client_credentials"],
      scope,
      client_credentials_scopes: scope.split(" "),
    });
  }

  async function token(client: { clientId: string; clientSecret?: string }, scope: string, resource: string) {
    return request("/oauth2/token", {
      headers: { authorization: basic(client.clientId, client.clientSecret!) },
      form: { grant_type: "client_credentials", scope, resource },
    });
  }

  it("refuses a token for API B carrying only API A's scopes", async () => {
    const client = await machineClient();
    const response = await token(client, "a:write", B);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_scope" });
  });

  it("drops API A's scopes from a token for API B", async () => {
    const client = await machineClient();
    const response = await token(client, "a:write b:read", B);
    expect(response.status, await response.clone().text()).toBe(200);
    const { access_token: accessToken, scope } = (await response.json()) as { access_token: string; scope: string };
    expect(scope).toBe("b:read");
    const payload = jwtPayload(accessToken);
    expect(payload.aud).toBe(B);
    expect(payload.scope).toBe("b:read");
  });

  it("keeps scopes no API declares (OAUTH_API_SCOPES) and restricted APIs as configured", async () => {
    const client = await machineClient();
    const unowned = await token(client, "a:read orders:write", A);
    expect(unowned.status, await unowned.clone().text()).toBe(200);
    expect(((await unowned.json()) as { scope: string }).scope.split(" ").sort()).toEqual(["a:read", "orders:write"]);
    const restricted = await token(client, "r:read b:read", R);
    expect(((await restricted.json()) as { scope: string }).scope).toBe("r:read");
  });
});

describe("the session JWT is off (L6)", () => {
  it("has no /token endpoint and no set-auth-jwt header", async () => {
    const user = await signedIn("user");
    expect((await request("/token", { headers: user.headers })).status).toBe(404);
    const session = await request("/get-session", { headers: user.headers });
    expect(session.status).toBe(200);
    expect(((await session.json()) as { user?: { id: string } }).user?.id).toBe(user.id);
    expect(session.headers.get("set-auth-jwt")).toBeNull();
  });

  it("still publishes the JWKS for access and ID tokens", async () => {
    const response = await request("/jwks");
    expect(response.status).toBe(200);
    expect(((await response.json()) as { keys: unknown[] }).keys.length).toBeGreaterThan(0);
  });
});
