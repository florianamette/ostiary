import type { APIRequest, APIRequestContext } from "@playwright/test";

import { newApi, registerApi } from "../support/admin";
import { createUser, enableTotp } from "../support/auth";
import { query } from "../support/db";
import { ADMIN_URL } from "../support/env";
import { expect, test } from "../support/fixtures";
import { basicAuth, clientCredentials, createClient, ENV_API, verifyJwt, waitForScope } from "../support/oauth";

/*
 * Who may manage OAuth clients, and what a client may do depending on how it was registered.
 * Clients are created from the admin console (marked admin-registered); a self-registered
 * client is simulated by clearing that mark in the database, so these tests never change the
 * instance-wide self-registration settings that registration.spec.ts toggles.
 */

const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const CLIENT_ENDPOINTS = ["/oauth2/create-client", "/oauth2/update-client", "/oauth2/client/rotate-secret", "/oauth2/delete-client"];

type ClientRow = { user_id: string | null; reference_id: string | null; admin_registered: boolean };

async function clientRow(clientId: string): Promise<ClientRow | undefined> {
  const rows = await query<ClientRow>("select user_id, reference_id, admin_registered from oauth_client where client_id = $1", [clientId]);
  return rows[0];
}

async function unmarkAdminRegistered(clientId: string) {
  await query("update oauth_client set admin_registered = false where client_id = $1", [clientId]);
}

/** The admin console's routes, with the cookies of `api` (cookies are per host, not per port). */
async function adminConsoleAs(
  playwright: { request: APIRequest },
  api: APIRequestContext,
  clientIp: string,
): Promise<APIRequestContext> {
  return playwright.request.newContext({
    baseURL: ADMIN_URL,
    storageState: await api.storageState(),
    extraHTTPHeaders: { origin: ADMIN_URL, "x-forwarded-for": clientIp },
  });
}

test("an ordinary user gets no client management (H1)", async ({ api, playwright, clientIp }) => {
  await createUser(api, "noclients");
  for (const path of CLIENT_ENDPOINTS) {
    const response = await api.post(`/api/auth${path}`, {
      data: { client_id: "x", redirect_uris: ["https://evil.e2e.test/cb"], client_name: "Totally Legit", update: {} },
    });
    expect(response.status(), path).toBe(404);
  }
  const list = await api.get("/api/auth/oauth2/get-clients");
  expect(list.status()).toBe(401);

  const consoleApi = await adminConsoleAs(playwright, api, clientIp);
  try {
    const create = await consoleApi.post("/api/admin/oauth-clients", { data: { redirect_uris: ["https://evil.e2e.test/cb"] } });
    expect(create.status()).toBe(403);
    expect((await consoleApi.get("/api/auth/oauth2/get-clients")).status()).toBe(401);
  } finally {
    await consoleApi.dispose();
  }
});

test("clients registered in the console belong to the platform, not to one admin (M6)", async ({ api, adminApi, playwright, clientIp }) => {
  // A second admin, with two-factor authentication as REQUIRE_ADMIN_2FA wants.
  const second = await createUser(api, "admin2");
  await query(`update "user" set role = 'admin' where email = $1`, [second.email]);
  await enableTotp(api, second.password);
  const secondConsole = await adminConsoleAs(playwright, api, clientIp);
  try {
    const client = await createClient(secondConsole, { token_endpoint_auth_method: "client_secret_basic" });
    expect(await clientRow(client.client_id)).toEqual({ user_id: null, reference_id: "ostiary:platform", admin_registered: true });

    // Demoted: no more control over the client, from the console or the auth server.
    await query(`update "user" set role = 'user' where email = $1`, [second.email]);
    const id = encodeURIComponent(client.client_id);
    expect((await secondConsole.patch(`/api/admin/oauth-clients/${id}`, { data: { client_name: "mine" } })).status()).toBe(403);
    expect((await secondConsole.post(`/api/admin/oauth-clients/${id}/rotate-secret`)).status()).toBe(403);
    expect((await secondConsole.delete(`/api/admin/oauth-clients/${id}`)).status()).toBe(403);
    for (const path of CLIENT_ENDPOINTS) {
      expect((await api.post(`/api/auth${path}`, { data: { client_id: client.client_id, update: { client_name: "mine" } } })).status(), path).toBe(404);
    }

    // Any other admin still manages it.
    const rotated = await adminApi.post(`/api/admin/oauth-clients/${id}/rotate-secret`);
    expect(rotated.status(), await rotated.text()).toBe(200);
    const { data } = (await rotated.json()) as { data: { client_secret?: string } };
    expect(data.client_secret).toBeTruthy();
    expect(data.client_secret).not.toBe(client.client_secret);
    const deleted = await adminApi.delete(`/api/admin/oauth-clients/${id}`);
    expect(deleted.status(), await deleted.text()).toBe(200);
    expect(await clientRow(client.client_id)).toBeUndefined();
  } finally {
    await secondConsole.dispose();
  }
});

test("a self-registered client cannot be widened past the self-registration policy (M8)", async ({ adminApi }) => {
  const client = await createClient(adminApi, { type: "native", token_endpoint_auth_method: "none", redirect_uris: ["http://127.0.0.1/callback"] });
  await unmarkAdminRegistered(client.client_id);
  const id = encodeURIComponent(client.client_id);

  const device = await adminApi.patch(`/api/admin/oauth-clients/${id}`, { data: { device_code: true } });
  expect(device.status()).toBe(400);
  expect(((await device.json()) as { error: string }).error).toContain("device_code");
  const consent = await adminApi.patch(`/api/admin/oauth-clients/${id}`, { data: { skip_consent: true } });
  expect(consent.status()).toBe(400);
  const grants = await query<{ grant_types: string[]; skip_consent: boolean | null }>(
    "select grant_types, skip_consent from oauth_client where client_id = $1",
    [client.client_id],
  );
  expect(grants[0]!.grant_types).not.toContain(DEVICE_GRANT);
  expect(grants[0]!.skip_consent).not.toBe(true);

  // Changes within the policy still work.
  const renamed = await adminApi.patch(`/api/admin/oauth-clients/${id}`, { data: { client_name: "renamed agent" } });
  expect(renamed.status(), await renamed.text()).toBe(200);
});

test("device sign-in is refused to a self-registered client however it authenticates (L4)", async ({ api, adminApi }) => {
  const body = { token_endpoint_auth_method: "client_secret_basic", grant_types: [DEVICE_GRANT, "refresh_token"], scope: "openid" };
  const reviewed = await createClient(adminApi, body);
  const unreviewed = await createClient(adminApi, body);
  await unmarkAdminRegistered(unreviewed.client_id);

  // HTTP Basic client authentication, no client_id in the body.
  const refused = await api.post("/api/auth/device/code", { form: { scope: "openid" }, headers: { authorization: basicAuth(unreviewed) } });
  expect(refused.status()).toBe(400);
  expect(await refused.json()).toMatchObject({ error: "unauthorized_client" });
  const byId = await api.post("/api/auth/device/code", { form: { client_id: unreviewed.client_id, scope: "openid" }, headers: { authorization: basicAuth(unreviewed) } });
  expect(byId.status()).toBe(400);

  const accepted = await api.post("/api/auth/device/code", { form: { scope: "openid" }, headers: { authorization: basicAuth(reviewed) } });
  expect(accepted.status(), await accepted.text()).toBe(200);
});

test("an API's scopes are not issued in a token for another API (L5)", async ({ adminPage, adminApi, api }) => {
  const orders = newApi("bound");
  await registerApi(adminPage, orders);
  await waitForScope(api, orders.scopes[0]!);
  const [ordersRead] = orders.scopes;
  const envRead = ENV_API.scopes[0];
  const client = await createClient(adminApi, { grant_types: ["client_credentials"], scope: `${ordersRead} ${envRead}` });

  // A token for the environment's API may not carry the console API's scope.
  const foreign = await clientCredentials(api, client, ordersRead!, ENV_API.identifier);
  expect(foreign.status()).toBe(400);
  expect(await foreign.json()).toMatchObject({ error: "invalid_scope" });

  const mixed = await clientCredentials(api, client, `${ordersRead} ${envRead}`, ENV_API.identifier);
  expect(mixed.status(), await mixed.text()).toBe(200);
  const token = (await mixed.json()) as { access_token: string; scope: string };
  expect(token.scope).toBe(envRead);
  expect(await verifyJwt(api, token.access_token, ENV_API.identifier)).toMatchObject({ aud: ENV_API.identifier, scope: envRead });

  // The API's own scopes, and OAUTH_API_SCOPES that no API declares, are still issued for it.
  const own = await clientCredentials(api, client, `${ordersRead} ${envRead}`, orders.identifier);
  expect(own.status(), await own.text()).toBe(200);
  expect(((await own.json()) as { scope: string }).scope.split(" ").sort()).toEqual([envRead, ordersRead].sort());
});

test("the session JWT endpoint and header are off (L6)", async ({ api }) => {
  await createUser(api, "nojwt");
  expect((await api.get("/api/auth/token")).status()).toBe(404);
  const session = await api.get("/api/auth/get-session");
  expect(session.status()).toBe(200);
  expect(session.headers()["set-auth-jwt"]).toBeUndefined();
  // Access and ID tokens are still verifiable.
  expect((await api.get("/api/auth/jwks")).status()).toBe(200);
});
