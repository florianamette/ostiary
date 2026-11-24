import { createUser } from "../support/auth";
import { query } from "../support/db";
import { expect, test } from "../support/fixtures";
import {
  authorizeUrl,
  basicAuth,
  CALLBACK_URL,
  connectApp,
  createClient,
  interceptCallback,
  pkce,
  tokenRequest,
  verifyJwt,
  type TokenResponse,
} from "../support/oauth";

/*
 * Pairwise subject identifiers (PAIRWISE_SECRET in .env.test): an app registered with
 * subject_type "pairwise" sees a `sub` derived from the user and its redirect host, not the
 * user's ID. Other apps keep the user's ID.
 */

const SCOPE = "openid email";

test("a pairwise app gets a sub of its own in the ID token, UserInfo and introspection", async ({ page, api, adminApi, adminPage }) => {
  const discovery = (await (await api.get("/.well-known/openid-configuration")).json()) as { subject_types_supported: string[] };
  expect(discovery.subject_types_supported).toEqual(["public", "pairwise"]);

  const user = await createUser(api, "pairwise");
  const [row] = await query<{ id: string }>(`select id from "user" where email = $1`, [user.email]);
  const userId = row!.id;

  const { client, tokens } = await connectApp(page, api, adminApi, user, SCOPE, { subject_type: "pairwise" });
  const idToken = await verifyJwt(api, tokens.id_token!, client.client_id);
  expect(idToken.sub).not.toBe(userId);
  // HMAC-SHA256 of the redirect host and the user ID, in base64.
  expect(idToken.sub).toMatch(/^[A-Za-z0-9+/]{43}=$/);

  const userinfo = await api.get("/api/auth/oauth2/userinfo", { headers: { authorization: `Bearer ${tokens.access_token}` } });
  expect(userinfo.status(), await userinfo.text()).toBe(200);
  expect(((await userinfo.json()) as { sub: string }).sub).toBe(idToken.sub);
  const introspected = await api.post("/api/auth/oauth2/introspect", {
    form: { token: tokens.access_token },
    headers: { authorization: basicAuth(client) },
  });
  expect(await introspected.json()).toMatchObject({ active: true, sub: idToken.sub });

  // Another app (public subject type) still gets the user's ID. The browser is signed in already.
  const other = await createClient(adminApi, { scope: SCOPE });
  const { verifier, challenge } = pkce();
  const callback = await interceptCallback(page);
  await page.goto(authorizeUrl(other, { scope: SCOPE, challenge }));
  await page.waitForURL(/\/consent/);
  await page.getByRole("button", { name: "Allow" }).click();
  const code = (await callback()).searchParams.get("code")!;
  const exchanged = await tokenRequest(api, other, { grant_type: "authorization_code", code, redirect_uri: CALLBACK_URL, code_verifier: verifier });
  expect(exchanged.status(), await exchanged.text()).toBe(200);
  const otherIdToken = await verifyJwt(api, ((await exchanged.json()) as TokenResponse).id_token!, other.client_id);
  expect(otherIdToken.sub).toBe(userId);

  // Only for apps that sign users in; the console offers it when PAIRWISE_SECRET is set.
  const machine = await adminApi.post("/api/admin/oauth-clients", {
    data: { client_name: "e2e pairwise machine", subject_type: "pairwise", grant_types: ["client_credentials"], scope: "e2e:read" },
  });
  expect(machine.status()).toBe(400);
  expect(await machine.text()).toContain("Pairwise user IDs are for apps that sign users in");
  await adminPage.goto("/en/applications");
  await adminPage.getByRole("button", { name: "Register application" }).click();
  await expect(adminPage.getByRole("dialog").getByRole("checkbox", { name: "Pairwise user IDs" })).toBeVisible();
});
