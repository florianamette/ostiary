import { createHash, randomBytes } from "node:crypto";

import { expect, type APIRequestContext } from "@playwright/test";
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify, type JSONWebKeySet, type JWTPayload } from "jose";

import { ISSUER } from "./env";

/**
 * Redirect URI of the test clients. Web clients need an https URI on a public host; the browser
 * never reaches it, tests intercept it (see interceptCallback).
 */
export const CALLBACK_URL = "https://app.e2e.test/callback";

export type Client = { client_id: string; client_secret?: string; client_name?: string };

export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  id_token?: string;
  refresh_token?: string;
};

/** Registers an OAuth client through the admin console's route (POST /api/admin/oauth-clients). */
export async function createClient(adminApi: APIRequestContext, body: Record<string, unknown>): Promise<Client> {
  const response = await adminApi.post("/api/admin/oauth-clients", {
    data: { redirect_uris: [CALLBACK_URL], client_name: `e2e ${randomBytes(4).toString("hex")}`, ...body },
  });
  expect(response.status(), await response.text()).toBe(201);
  const { data } = (await response.json()) as { data: Client };
  expect(data.client_id).toBeTruthy();
  return data;
}

export function basicAuth(client: Client): string {
  const id = encodeURIComponent(client.client_id);
  const secret = encodeURIComponent(client.client_secret ?? "");
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

/** POST /oauth2/token; confidential clients authenticate with HTTP Basic. */
export async function tokenRequest(api: APIRequestContext, client: Client, form: Record<string, string>) {
  const headers: Record<string, string> = {};
  const body = { ...form };
  if (client.client_secret) headers.authorization = basicAuth(client);
  else body.client_id = client.client_id;
  return api.post("/api/auth/oauth2/token", { form: body, headers });
}

export async function clientCredentials(api: APIRequestContext, client: Client, scope: string, resource?: string) {
  return tokenRequest(api, client, {
    grant_type: "client_credentials",
    scope,
    ...(resource ? { resource } : {}),
  });
}

export function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function authorizeUrl(client: Client, params: { scope: string; challenge: string; state?: string; extra?: Record<string, string> }) {
  const url = new URL(`${ISSUER}/oauth2/authorize`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: CALLBACK_URL,
    scope: params.scope,
    state: params.state ?? randomBytes(8).toString("hex"),
    code_challenge: params.challenge,
    code_challenge_method: "S256",
    ...params.extra,
  }).toString();
  return url.toString();
}

export async function jwks(api: APIRequestContext): Promise<JSONWebKeySet> {
  const response = await api.get("/api/auth/jwks");
  expect(response.ok()).toBe(true);
  return (await response.json()) as JSONWebKeySet;
}

/** Verifies a JWT against the current JWKS (signature, issuer and, if given, audience). */
export async function verifyJwt(api: APIRequestContext, token: string, audience?: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, createLocalJWKSet(await jwks(api)), {
    issuer: ISSUER,
    ...(audience ? { audience } : {}),
  });
  return payload;
}

export function kidOf(token: string): string | undefined {
  return decodeProtectedHeader(token).kid;
}

/** Waits until the auth server's discovery document lists the scope (it reloads them within a minute). */
export async function waitForScope(api: APIRequestContext, scope: string, present = true) {
  await expect
    .poll(
      async () => {
        const response = await api.get("/api/auth/.well-known/openid-configuration");
        const doc = (await response.json()) as { scopes_supported?: string[] };
        return doc.scopes_supported?.includes(scope) ?? false;
      },
      { message: `discovery lists ${scope}`, timeout: 80_000, intervals: [1_000, 2_000, 3_000] },
    )
    .toBe(present);
}

/** Answers the client's redirect URI in this page, and resolves with the URL it was called with. */
export async function interceptCallback(page: import("@playwright/test").Page): Promise<() => Promise<URL>> {
  let resolve!: (url: URL) => void;
  const called = new Promise<URL>((r) => (resolve = r));
  await page.route(`${CALLBACK_URL}**`, async (route) => {
    resolve(new URL(route.request().url()));
    await route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Callback</title><h1>Callback received</h1>" });
  });
  return () => called;
}

/** The API registered from the environment (OAUTH_API_AUDIENCES / OAUTH_API_SCOPES in .env.test). */
export const ENV_API = { identifier: "https://api.e2e.test", scopes: ["e2e:read", "e2e:write"] } as const;
