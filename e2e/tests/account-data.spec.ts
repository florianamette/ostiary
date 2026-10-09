import { readFileSync } from "node:fs";

import type { Page } from "@playwright/test";

import { createUser, enableTotp, loginViaUi, signInWithPassword, type TestUser } from "../support/auth";
import { AUTH_URL } from "../support/env";
import { ADMIN_STATE, expect, test } from "../support/fixtures";
import { waitForEmail } from "../support/mail";
import {
  CALLBACK_URL,
  authorizeUrl,
  createClient,
  interceptCallback,
  pkce,
  tokenRequest,
  type Client,
  type TokenResponse,
} from "../support/oauth";

/* "Your data" on the dashboard: export everything (no secrets), and delete the account by email link. */

const SCOPE = "openid profile email offline_access";

/** Signs in on the page and connects the user to a new app; returns the app's tokens. */
async function connectApp(page: Page, adminApi: Parameters<typeof createClient>[0], api: Parameters<typeof tokenRequest>[0], user: TestUser) {
  const client: Client = await createClient(adminApi, { scope: SCOPE });
  const { verifier, challenge } = pkce();
  const callback = await interceptCallback(page);
  await page.goto(authorizeUrl(client, { scope: SCOPE, challenge }));
  await page.waitForURL(/\/login/);
  await loginViaUi(page, user.email, user.password, false);
  await page.waitForURL(/\/consent/);
  await page.getByRole("button", { name: "Allow" }).click();
  const code = (await callback()).searchParams.get("code")!;
  const exchanged = await tokenRequest(api, client, { grant_type: "authorization_code", code, redirect_uri: CALLBACK_URL, code_verifier: verifier });
  expect(exchanged.status(), await exchanged.text()).toBe(200);
  return { client, tokens: (await exchanged.json()) as TokenResponse };
}

test("the export holds every section and no secret", async ({ api, adminApi, page }) => {
  const user = await createUser(api, "export");
  const { client, tokens } = await connectApp(page, adminApi, api, user);
  const totpSecret = await enableTotp(api, user.password);

  await page.goto("/en/dashboard#data");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download my data" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^ostiary-account-.+\.json$/);
  const text = readFileSync((await download.path())!, "utf8");
  const data = JSON.parse(text);

  expect(data).toMatchObject({ format: "ostiary.account-export", version: 1, profile: { email: user.email, username: user.username } });
  expect(data.twoFactor).toMatchObject({ enabled: true, method: "authenticator_app" });
  expect(data.signInMethods).toEqual([expect.objectContaining({ provider: "credential", passwordSet: true })]);
  expect(data.connectedApps).toEqual([expect.objectContaining({ clientId: client.client_id })]);
  expect(data.organizations.length).toBeGreaterThan(0);
  expect(data.sessions.length).toBeGreaterThan(0);
  expect(data.signInEvents.length).toBeGreaterThan(0);

  const cookie = (await page.context().cookies()).find((c) => c.name.endsWith("session_token"))!.value;
  for (const secret of [user.password, totpSecret, tokens.access_token, tokens.refresh_token!, client.client_secret!, decodeURIComponent(cookie).split(".")[0]!]) {
    expect(text).not.toContain(secret);
  }
});

test("an account is deleted from the emailed link, and its tokens stop working", async ({ api, adminApi, page }) => {
  const user = await createUser(api, "erase");
  const { tokens } = await connectApp(page, adminApi, api, user);

  await page.goto("/en/dashboard#data");
  await page.getByRole("button", { name: "Delete my account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: `Type ${user.email} to confirm` }).fill(user.email);
  await dialog.getByLabel("Password").fill(user.password);
  const since = Date.now() - 1000;
  await dialog.getByRole("button", { name: "Email me the confirmation link" }).click();
  await expect(dialog.getByText("Check your inbox")).toBeVisible();

  const mail = await waitForEmail(user.email, "delete-account", since);
  expect(mail.url).toMatch(new RegExp(`^${AUTH_URL}/en/delete-account\\?token=`));
  // Opening the link deletes nothing until the person confirms.
  await page.goto(mail.url!);
  const userinfo = () => api.get("/api/auth/oauth2/userinfo", { headers: { authorization: `Bearer ${tokens.access_token}` } });
  expect((await userinfo()).status()).toBe(200);

  await page.getByRole("button", { name: "Delete my account permanently" }).click();
  await expect(page.getByText("Your account was deleted")).toBeVisible();

  expect((await signInWithPassword(api, user.email, user.password)).status()).toBe(401);
  expect((await userinfo()).status()).toBe(401);
  // The link works once.
  await page.goto(mail.url!);
  await expect(page).toHaveURL(/\/login/);
});

test("admins cannot delete their own account", async ({ playwright, clientIp }) => {
  const admin = await playwright.request.newContext({
    baseURL: AUTH_URL,
    storageState: ADMIN_STATE,
    extraHTTPHeaders: { origin: AUTH_URL, "x-forwarded-for": clientIp },
  });
  const refused = await admin.post("/api/auth/delete-user", { data: {} });
  expect(refused.status()).toBe(403);
  expect(await refused.json()).toMatchObject({ code: "ACCOUNT_DELETION_BLOCKED" });
  await admin.dispose();
});
