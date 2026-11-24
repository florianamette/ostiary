import { randomUUID } from "node:crypto";

import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";

import { selectOption } from "../support/admin";
import { createUser } from "../support/auth";
import { query } from "../support/db";
import { expect, test } from "../support/fixtures";
import { ISSUER } from "../support/env";
import { connectApp, createClient, ENV_API, verifyJwt, waitForScope } from "../support/oauth";

/*
 * Settings the admin console sets on the apps it registers (#78): private_key_jwt with the
 * app's public keys (JWKS), and OpenID Connect Back-Channel Logout.
 */

const ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

async function keyPair(kid: string): Promise<{ privateKey: CryptoKey; jwk: JWK }> {
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  return { privateKey, jwk: { ...(await exportJWK(publicKey)), kid, alg: "ES256", use: "sig" } };
}

function assertion(clientId: string, key: { privateKey: CryptoKey; jwk: JWK }, audience: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: key.jwk.kid })
    .setIssuer(clientId)
    .setSubject(clientId)
    .setAudience(audience)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(key.privateKey);
}

test("a machine client authenticates with private_key_jwt, and its keys are replaced from the console or by the app", async ({ api, adminApi }) => {
  const scope = ENV_API.scopes[0]!;
  await waitForScope(api, scope);
  const first = await keyPair("first");
  const client = await createClient(adminApi, {
    redirect_uris: [],
    grant_types: ["client_credentials"],
    scope,
    resources: [ENV_API.identifier],
    token_endpoint_auth_method: "private_key_jwt",
    jwks: { keys: [first.jwk] },
  });
  expect(client.client_secret).toBeUndefined();
  const tokenEndpoint = `${ISSUER}/oauth2/token`;
  const token = (key: { privateKey: CryptoKey; jwk: JWK }) =>
    assertion(client.client_id, key, tokenEndpoint).then((jwt) =>
      api.post("/api/auth/oauth2/token", {
        form: { grant_type: "client_credentials", scope, resource: ENV_API.identifier, client_assertion_type: ASSERTION_TYPE, client_assertion: jwt },
      }),
    );

  const granted = await token(first);
  expect(granted.status(), await granted.text()).toBe(200);
  const claims = await verifyJwt(api, ((await granted.json()) as { access_token: string }).access_token, ENV_API.identifier);
  expect(claims.sub).toBe(client.client_id);

  // A key it did not register is refused.
  const stranger = await keyPair("first");
  expect((await token(stranger)).status()).toBe(401);

  // The console replaces the keys: the old one stops working. A private key is refused.
  const second = await keyPair("second");
  const privateJwk = await exportJWK(second.privateKey);
  const leaked = await adminApi.patch(`/api/admin/oauth-clients/${encodeURIComponent(client.client_id)}`, { data: { jwks: { keys: [privateJwk] } } });
  expect(leaked.status()).toBe(400);
  expect(await leaked.text()).toContain("private key");
  const replaced = await adminApi.patch(`/api/admin/oauth-clients/${encodeURIComponent(client.client_id)}`, { data: { jwks: { keys: [second.jwk] } } });
  expect(replaced.status(), await replaced.text()).toBe(200);
  expect((await token(first)).status()).toBe(401);
  expect((await token(second)).status()).toBe(200);

  // The app rotates its own keys, proving it holds a current one.
  const third = await keyPair("third");
  const rotated = await api.post("/api/auth/oauth2/client/rotate-keys", {
    data: {
      client_assertion_type: ASSERTION_TYPE,
      client_assertion: await assertion(client.client_id, second, `${ISSUER}/oauth2/client/rotate-keys`),
      jwks: { keys: [third.jwk] },
    },
  });
  expect(rotated.status(), await rotated.text()).toBe(200);
  expect((await token(second)).status()).toBe(401);
  expect((await token(third)).status()).toBe(200);

  // A client secret app has no keys to replace; private_key_jwt needs keys.
  const secretApp = await createClient(adminApi, {});
  const noKeys = await adminApi.patch(`/api/admin/oauth-clients/${encodeURIComponent(secretApp.client_id)}`, { data: { jwks: { keys: [third.jwk] } } });
  expect(noKeys.status()).toBe(400);
  const missing = await adminApi.post("/api/admin/oauth-clients", {
    data: { redirect_uris: ["https://app.e2e.test/callback"], token_endpoint_auth_method: "private_key_jwt" },
  });
  expect(missing.status()).toBe(400);
});

type BackchannelRow = { backchannel_logout_uri: string | null; backchannel_logout_session_required: boolean | null };

test("an app registered with a back-channel logout URI gets sid in its ID tokens, and the URI can be changed and removed", async ({ page, api, adminApi }) => {
  const user = await createUser(api, "backchannel");
  const uri = "https://app.e2e.test/backchannel-logout";
  const { client, tokens } = await connectApp(page, api, adminApi, user, "openid email", {
    backchannel_logout_uri: uri,
    backchannel_logout_session_required: true,
  });
  const stored = () => query<BackchannelRow>("select backchannel_logout_uri, backchannel_logout_session_required from oauth_client where client_id = $1", [client.client_id]);
  expect(await stored()).toEqual([{ backchannel_logout_uri: uri, backchannel_logout_session_required: true }]);
  // The logout token names the session (sid); the ID token carries it so the app can match them.
  const idToken = await verifyJwt(api, tokens.id_token!, client.client_id);
  expect(typeof idToken.sid).toBe("string");

  const path = `/api/admin/oauth-clients/${encodeURIComponent(client.client_id)}`;
  expect((await adminApi.patch(path, { data: { backchannel_logout_uri: "http://app.e2e.test/logout" } })).status()).toBe(400);
  const changed = await adminApi.patch(path, { data: { backchannel_logout_uri: `${uri}/v2`, backchannel_logout_session_required: false } });
  expect(changed.status(), await changed.text()).toBe(200);
  expect(await stored()).toEqual([{ backchannel_logout_uri: `${uri}/v2`, backchannel_logout_session_required: false }]);
  const removed = await adminApi.patch(path, { data: { backchannel_logout_uri: null } });
  expect(removed.status(), await removed.text()).toBe(200);
  expect(await stored()).toEqual([{ backchannel_logout_uri: null, backchannel_logout_session_required: null }]);

  // Not for a machine client, which has no user sessions.
  const machine = await adminApi.post("/api/admin/oauth-clients", {
    data: { grant_types: ["client_credentials"], scope: ENV_API.scopes[0], backchannel_logout_uri: uri },
  });
  expect(machine.status()).toBe(400);
});

test("the Register application dialog sets private_key_jwt and a back-channel logout URI", async ({ adminPage }) => {
  const key = await keyPair("ui");
  const name = `e2e key app ${randomUUID().slice(0, 8)}`;
  await adminPage.goto("/en/applications");
  await adminPage.getByRole("button", { name: "Register application" }).click();
  const dialog = adminPage.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Application name" }).fill(name);
  await dialog.getByLabel("Redirect URIs", { exact: true }).fill("https://app.e2e.test/callback");
  await selectOption(adminPage, dialog, "Client authentication", "Private key JWT (public keys)");
  await dialog.getByRole("textbox", { name: "Public keys (JWKS)" }).fill("{not json");
  await dialog.getByRole("button", { name: "Create application" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("The JWKS is not valid JSON.");
  await dialog.getByRole("textbox", { name: "Public keys (JWKS)" }).fill(JSON.stringify({ keys: [key.jwk] }));
  await dialog.getByRole("textbox", { name: "Back-channel logout URI (optional)" }).fill("https://app.e2e.test/backchannel");
  await dialog.getByRole("checkbox", { name: "The app needs the session ID (sid)" }).check();
  await dialog.getByRole("button", { name: "Create application" }).click();
  await expect(dialog.getByText("No secret is issued")).toBeVisible();
  const clientId = await dialog.locator("input[readonly]").nth(0).inputValue();
  await expect(dialog.locator("input[readonly]")).toHaveCount(1);

  const [row] = await query<BackchannelRow & { token_endpoint_auth_method: string; jwks: string }>(
    "select token_endpoint_auth_method, jwks, backchannel_logout_uri, backchannel_logout_session_required from oauth_client where client_id = $1",
    [clientId],
  );
  expect(row).toMatchObject({
    token_endpoint_auth_method: "private_key_jwt",
    backchannel_logout_uri: "https://app.e2e.test/backchannel",
    backchannel_logout_session_required: true,
  });
  expect(JSON.parse(row!.jwks)).toEqual({ keys: [key.jwk] });
});
