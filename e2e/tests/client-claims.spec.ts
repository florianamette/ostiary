import type { Locator, Page } from "@playwright/test";

import { createUser, loginViaUi } from "../support/auth";
import { query, userIdOf } from "../support/db";
import { expect, test } from "../support/fixtures";
import {
  CALLBACK_URL,
  ENV_API,
  authorizeUrl,
  clientCredentials,
  createClient,
  interceptCallback,
  pkce,
  tokenRequest,
  verifyJwt,
  type Client,
  type TokenResponse,
} from "../support/oauth";

/*
 * Per-application custom claims (lib/client-claims): set in the console's "Token claims" dialog,
 * added by Ostiary's oauth-provider extension to the ID token, the JWT access token and UserInfo,
 * on every grant (authorization code, refresh, client credentials without a user).
 */

type ClaimInput = {
  name: string;
  /** Text, JSON (typed as is) or an attribute's label in the list. */
  value: { text: string } | { json: string } | { attribute: RegExp };
  tokens: ("ID token" | "Access token" | "UserInfo")[];
};

async function openClaims(page: Page, client: Client): Promise<Locator> {
  await page.goto(`/en/applications?q=${encodeURIComponent(client.client_id)}`);
  await page.getByRole("button", { name: `Actions for ${client.client_name}` }).click();
  await page.getByRole("menuitem", { name: "Token claims" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Add claim" })).toBeVisible();
  return dialog;
}

async function fillClaim(page: Page, dialog: Locator, index: number, claim: ClaimInput) {
  await dialog.getByRole("button", { name: "Add claim" }).click();
  const group = dialog.getByRole("group", { name: `Claim ${index}` });
  await group.getByRole("textbox", { name: "Claim name" }).fill(claim.name);
  if ("text" in claim.value) {
    await group.getByRole("textbox", { name: "Value" }).fill(claim.value.text);
  } else if ("json" in claim.value) {
    await group.getByRole("combobox", { name: "Value from" }).click();
    await page.getByRole("option", { name: "JSON" }).click();
    await group.getByRole("textbox", { name: "Value" }).fill(claim.value.json);
  } else {
    await group.getByRole("combobox", { name: "Value from" }).click();
    await page.getByRole("option", { name: "User attribute" }).click();
    await group.getByRole("combobox", { name: "Attribute" }).click();
    await page.getByRole("option", { name: claim.value.attribute }).click();
  }
  for (const token of ["ID token", "Access token", "UserInfo"] as const) {
    await group.getByRole("checkbox", { name: token }).setChecked(claim.tokens.includes(token));
  }
}

async function setClaims(page: Page, client: Client, claims: ClaimInput[]) {
  const dialog = await openClaims(page, client);
  for (const [i, claim] of claims.entries()) await fillClaim(page, dialog, i + 1, claim);
  await dialog.getByRole("button", { name: "Save claims" }).click();
  await expect(page.getByText("Token claims saved")).toBeVisible();
}

async function storedClaims(clientId: string) {
  const rows = await query<{ claims: unknown }>(`select claims from oauth_client_claims where client_id = $1`, [clientId]);
  return rows[0]?.claims ?? null;
}

const SCOPE = `openid profile email offline_access ${ENV_API.scopes[0]}`;

test("a reserved claim is refused and nothing is saved", async ({ adminApi, adminPage }) => {
  const client = await createClient(adminApi, { scope: "openid profile email" });
  const dialog = await openClaims(adminPage, client);
  await fillClaim(adminPage, dialog, 1, { name: "email", value: { text: "someone@else.test" }, tokens: ["ID token"] });
  // The preview already says so; the server refuses it too.
  await expect(dialog.getByTestId("claims-preview-error")).toHaveText('"email" is a reserved claim: the server sets it.');
  await dialog.getByRole("button", { name: "Save claims" }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: '"email" is a reserved claim' })).toHaveCount(2);
  await expect(dialog).toBeVisible();
  expect(await storedClaims(client.client_id)).toBeNull();

  // The same name, namespaced, is fine.
  await dialog.getByRole("group", { name: "Claim 1" }).getByRole("textbox", { name: "Claim name" }).fill("https://e2e.test/email");
  await expect(dialog.getByText('"https://e2e.test/email": "someone@else.test"').first()).toBeVisible();
  await dialog.getByRole("button", { name: "Save claims" }).click();
  await expect(adminPage.getByText("Token claims saved")).toBeVisible();
  expect(await storedClaims(client.client_id)).toEqual([
    { name: "https://e2e.test/email", tokens: ["id_token"], source: "static", value: "someone@else.test" },
  ]);
});

test("claims set in the console reach the ID token, access token and UserInfo, also after a refresh", async ({ api, adminApi, adminPage, page }) => {
  const user = await createUser(api, "claims");
  const client = await createClient(adminApi, { scope: SCOPE });
  await setClaims(adminPage, client, [
    { name: "https://e2e.test/tenant", value: { text: "acme" }, tokens: ["ID token", "Access token", "UserInfo"] },
    { name: "https://e2e.test/plan", value: { json: '{"tier": "gold", "seats": 5}' }, tokens: ["ID token"] },
    { name: "handle", value: { attribute: /^Username/ }, tokens: ["Access token", "UserInfo"] },
    { name: "app_role", value: { attribute: /^Platform role/ }, tokens: ["Access token"] },
    { name: "orgs", value: { attribute: /^Organization memberships/ }, tokens: ["ID token"] },
  ]);

  const { verifier, challenge } = pkce();
  const callback = await interceptCallback(page);
  await page.goto(authorizeUrl(client, { scope: SCOPE, challenge, extra: { resource: ENV_API.identifier } }));
  await page.waitForURL(/\/login/);
  await loginViaUi(page, user.email, user.password, false);
  await page.waitForURL(/\/consent/);
  await page.getByRole("button", { name: "Allow" }).click();
  const code = (await callback()).searchParams.get("code")!;
  const exchanged = await tokenRequest(api, client, {
    grant_type: "authorization_code",
    code,
    redirect_uri: CALLBACK_URL,
    code_verifier: verifier,
    resource: ENV_API.identifier,
  });
  expect(exchanged.status(), await exchanged.text()).toBe(200);
  const tokens = (await exchanged.json()) as TokenResponse;

  // The user's organizations as stored (sign-up may add new users to one).
  const memberships = await query<{ id: string; slug: string; role: string }>(
    `select o.id, o.slug, m.role from member m join organization o on o.id = m.organization_id where m.user_id = $1 order by m.created_at`,
    [await userIdOf(user.email)],
  );
  const idToken = await verifyJwt(api, tokens.id_token!, client.client_id);
  expect(idToken).toMatchObject({
    "https://e2e.test/tenant": "acme",
    "https://e2e.test/plan": { tier: "gold", seats: 5 },
    orgs: memberships,
    // Ostiary's own claims are untouched.
    email: user.email,
    name: user.name,
  });
  expect(idToken).not.toHaveProperty("handle");
  expect(idToken).not.toHaveProperty("app_role");

  const accessToken = await verifyJwt(api, tokens.access_token, ENV_API.identifier);
  expect(accessToken).toMatchObject({
    "https://e2e.test/tenant": "acme",
    handle: user.username,
    app_role: "user",
    role: "user",
    azp: client.client_id,
  });
  expect(accessToken).not.toHaveProperty("https://e2e.test/plan");

  const userinfo = await api.get("/api/auth/oauth2/userinfo", { headers: { authorization: `Bearer ${tokens.access_token}` } });
  expect(userinfo.status(), await userinfo.text()).toBe(200);
  const info = (await userinfo.json()) as Record<string, unknown>;
  expect(info).toMatchObject({ sub: idToken.sub, email: user.email, "https://e2e.test/tenant": "acme", handle: user.username });
  expect(info).not.toHaveProperty("app_role");

  // Refresh token rotation: the new tokens carry the claims too.
  const refreshed = await tokenRequest(api, client, {
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token!,
    resource: ENV_API.identifier,
  });
  expect(refreshed.status(), await refreshed.text()).toBe(200);
  const next = (await refreshed.json()) as TokenResponse;
  expect(next.refresh_token).not.toBe(tokens.refresh_token);
  expect(await verifyJwt(api, next.access_token, ENV_API.identifier)).toMatchObject({
    "https://e2e.test/tenant": "acme",
    handle: user.username,
    app_role: "user",
  });
  if (next.id_token) {
    expect(await verifyJwt(api, next.id_token, client.client_id)).toMatchObject({ "https://e2e.test/plan": { tier: "gold", seats: 5 } });
  }

  // Another application gets none of them.
  const other = await createClient(adminApi, { grant_types: ["client_credentials"], scope: ENV_API.scopes[0] });
  const otherToken = await clientCredentials(api, other, ENV_API.scopes[0], ENV_API.identifier);
  expect(otherToken.status(), await otherToken.text()).toBe(200);
  const otherClaims = await verifyJwt(api, ((await otherToken.json()) as TokenResponse).access_token, ENV_API.identifier);
  expect(otherClaims).not.toHaveProperty("https://e2e.test/tenant");
});

test("client credentials tokens get the fixed claims only", async ({ api, adminApi, adminPage }) => {
  const client = await createClient(adminApi, { grant_types: ["client_credentials"], scope: ENV_API.scopes[0] });
  await setClaims(adminPage, client, [
    { name: "https://e2e.test/tenant", value: { text: "acme" }, tokens: ["Access token"] },
    { name: "app_role", value: { attribute: /^Platform role/ }, tokens: ["Access token"] },
  ]);
  const response = await clientCredentials(api, client, ENV_API.scopes[0], ENV_API.identifier);
  expect(response.status(), await response.text()).toBe(200);
  const claims = await verifyJwt(api, ((await response.json()) as TokenResponse).access_token, ENV_API.identifier);
  expect(claims).toMatchObject({ "https://e2e.test/tenant": "acme", azp: client.client_id });
  expect(claims).not.toHaveProperty("app_role");
});
