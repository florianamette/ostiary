import { createUser, loginViaUi } from "../support/auth";
import { AUTH_URL } from "../support/env";
import { expect, test } from "../support/fixtures";
import { CALLBACK_URL, authorizeUrl, createClient, interceptCallback, pkce, tokenRequest, verifyJwt, type TokenResponse } from "../support/oauth";

/* OpenID Connect for a registered client: authorization code with PKCE, consent, tokens, UserInfo, device flow. */

const SCOPE = "openid profile email offline_access";

test("authorization code with PKCE, consent, token, refresh and UserInfo", async ({ api, adminApi, page }) => {
  const user = await createUser(api, "oidc");
  const client = await createClient(adminApi, { scope: SCOPE });
  const { verifier, challenge } = pkce();
  const state = "state-" + Date.now();

  const callback = await interceptCallback(page);
  await page.goto(authorizeUrl(client, { scope: SCOPE, challenge, state }));
  // Not signed in: the login page, then the consent screen.
  await page.waitForURL(/\/login/);
  await loginViaUi(page, user.email, user.password, false);
  await page.waitForURL(/\/consent/);
  await expect(page.getByText(client.client_name!).first()).toBeVisible();
  await page.getByRole("button", { name: "Allow" }).click();

  const returned = await callback();
  expect(returned.origin + returned.pathname).toBe(CALLBACK_URL);
  expect(returned.searchParams.get("state")).toBe(state);
  expect(returned.searchParams.get("iss")).toBe(`${AUTH_URL}/api/auth`);
  const code = returned.searchParams.get("code")!;
  expect(code).toBeTruthy();

  const exchanged = await tokenRequest(api, client, {
    grant_type: "authorization_code",
    code,
    redirect_uri: CALLBACK_URL,
    code_verifier: verifier,
  });
  expect(exchanged.status(), await exchanged.text()).toBe(200);
  const tokens = (await exchanged.json()) as TokenResponse;
  expect(tokens).toMatchObject({ token_type: "Bearer" });
  expect(tokens.refresh_token).toBeTruthy();
  const idClaims = await verifyJwt(api, tokens.id_token!, client.client_id);
  expect(idClaims).toMatchObject({ email: user.email, email_verified: true, name: user.name });

  const userinfo = await api.get("/api/auth/oauth2/userinfo", { headers: { authorization: `Bearer ${tokens.access_token}` } });
  expect(userinfo.status(), await userinfo.text()).toBe(200);
  expect(await userinfo.json()).toMatchObject({ sub: idClaims.sub, email: user.email });

  const refreshed = await tokenRequest(api, client, { grant_type: "refresh_token", refresh_token: tokens.refresh_token! });
  expect(refreshed.status(), await refreshed.text()).toBe(200);
  const next = (await refreshed.json()) as TokenResponse;
  expect(next.access_token).not.toBe(tokens.access_token);
  const again = await api.get("/api/auth/oauth2/userinfo", { headers: { authorization: `Bearer ${next.access_token}` } });
  expect(again.status()).toBe(200);

  // Consent is remembered: a second authorization redirects straight back to the app (an HTTP
  // redirect, which page.route cannot answer, hence the browser context's request client).
  const second = await page.request.get(authorizeUrl(client, { scope: SCOPE, challenge: pkce().challenge, state: "second" }), {
    maxRedirects: 0,
  });
  expect(second.status()).toBe(302);
  const back = new URL(second.headers().location!);
  expect(back.origin + back.pathname).toBe(CALLBACK_URL);
  expect(back.searchParams.get("state")).toBe("second");
  expect(back.searchParams.get("code")).toBeTruthy();
});

test("the consent screen can deny access", async ({ api, adminApi, page }) => {
  const user = await createUser(api, "deny");
  const client = await createClient(adminApi, { scope: SCOPE });
  const callback = await interceptCallback(page);
  await page.goto(authorizeUrl(client, { scope: SCOPE, challenge: pkce().challenge, state: "deny" }));
  await loginViaUi(page, user.email, user.password, false);
  await page.waitForURL(/\/consent/);
  await page.getByRole("button", { name: "Deny" }).click();
  const returned = await callback();
  expect(returned.searchParams.get("error")).toBe("access_denied");
  expect(returned.searchParams.get("code")).toBeNull();
});

test("device flow: code issued, approved in the browser, token polled", async ({ api, adminApi, page }) => {
  const user = await createUser(api, "device");
  const client = await createClient(adminApi, {
    type: "native",
    token_endpoint_auth_method: "none",
    redirect_uris: ["http://127.0.0.1/callback"],
    grant_types: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
    scope: SCOPE,
  });

  const issued = await api.post("/api/auth/device/code", { form: { client_id: client.client_id, scope: SCOPE } });
  expect(issued.status(), await issued.text()).toBe(200);
  const device = (await issued.json()) as { device_code: string; user_code: string; verification_uri_complete: string; interval: number };
  expect(device.verification_uri_complete).toContain(`${AUTH_URL}/`);

  const poll = () =>
    tokenRequest(api, client, { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: device.device_code });
  const pending = await poll();
  expect(pending.status()).toBe(400);
  expect(await pending.json()).toMatchObject({ error: "authorization_pending" });

  await loginViaUi(page, user.email, user.password);
  await page.waitForURL(/\/dashboard/);
  await page.goto(device.verification_uri_complete);
  await expect(page.getByText(client.client_name!).first()).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Device connected")).toBeVisible();

  let tokens: TokenResponse | undefined;
  await expect
    .poll(
      async () => {
        const response = await poll();
        if (response.status() === 200) tokens = (await response.json()) as TokenResponse;
        return response.status();
      },
      // Polling faster than `interval` gets slow_down (and a longer interval): stay well above it.
      { timeout: 60_000, intervals: [(device.interval * 2 + 1) * 1000] },
    )
    .toBe(200);
  expect(tokens!.access_token).toBeTruthy();
  expect(await verifyJwt(api, tokens!.id_token!, client.client_id)).toMatchObject({ email: user.email });
});
