import { createUser } from "../support/auth";
import { expect, test } from "../support/fixtures";
import { basicAuth, connectApp, tokenRequest, type Client, type TokenResponse } from "../support/oauth";

/*
 * Client secrets start with ost_cs_ and refresh tokens with ost_rt_ (lib/oauth-token-prefixes).
 * Better Auth refuses a value without its prefix, so the auth app adds it to the values issued
 * before the prefixes. An old value is the new one without its prefix: Better Auth stores the
 * hash of what follows the prefix.
 */

const SCOPE = "openid email offline_access";
const unprefixed = (value: string, prefix: string) => {
  expect(value.startsWith(prefix), value).toBe(true);
  return value.slice(prefix.length);
};

test("new secrets and refresh tokens are prefixed, and those issued before still work", async ({ api, adminApi, page }) => {
  const user = await createUser(api, "prefixes");
  const { client, tokens } = await connectApp(page, api, adminApi, user, SCOPE);
  const oldClient: Client = { ...client, client_secret: unprefixed(client.client_secret!, "ost_cs_") };
  const oldRefresh = unprefixed(tokens.refresh_token!, "ost_rt_");

  // Introspection without a hint finds an old refresh token.
  const introspected = await api.post("/api/auth/oauth2/introspect", {
    form: { token: oldRefresh },
    headers: { authorization: basicAuth(oldClient) },
  });
  expect(introspected.status(), await introspected.text()).toBe(200);
  expect(await introspected.json()).toMatchObject({ active: true, client_id: client.client_id });

  // An old secret (HTTP Basic) and an old refresh token refresh, and get prefixed ones back.
  const refreshed = await tokenRequest(api, oldClient, { grant_type: "refresh_token", refresh_token: oldRefresh });
  expect(refreshed.status(), await refreshed.text()).toBe(200);
  const next = (await refreshed.json()) as TokenResponse;
  expect(next.refresh_token).toMatch(/^ost_rt_/);

  // Revocation without a hint revokes an old refresh token.
  const revoked = await api.post("/api/auth/oauth2/revoke", {
    form: { token: unprefixed(next.refresh_token!, "ost_rt_") },
    headers: { authorization: basicAuth(oldClient) },
  });
  expect(revoked.status(), await revoked.text()).toBe(200);
  const afterRevoke = await tokenRequest(api, client, { grant_type: "refresh_token", refresh_token: next.refresh_token! });
  expect(afterRevoke.status()).toBe(400);

  // A wrong secret is still refused.
  const wrong = await tokenRequest(api, { ...client, client_secret: "not-the-secret" }, { grant_type: "refresh_token", refresh_token: next.refresh_token! });
  expect(wrong.status()).toBe(401);
});
