import { createUser, loginViaUi } from "../support/auth";
import { query, userIdOf } from "../support/db";
import { expect, test } from "../support/fixtures";
import { authorizeUrl, createClient, interceptCallback, pkce } from "../support/oauth";

/*
 * A password found in a breach at sign-in (security/password-breach.ts): the app sign-in and the
 * account page stop at "Change your password" until it changes. The lookup itself is off in e2e
 * test mode (no network): the record is written as the sign-in check would.
 */

async function markBreached(email: string) {
  await query(`insert into password_breach (user_id) values ($1) on conflict do nothing`, [await userIdOf(email)]);
}

async function changePassword(page: import("@playwright/test").Page, current: string) {
  await expect(page.getByRole("main").getByText("Change your password")).toBeVisible();
  await page.getByLabel("Current password").fill(current);
  await page.getByLabel("New password", { exact: true }).fill(`${current}-new`);
  await page.getByLabel("Confirm new password").fill(`${current}-new`);
  await page.getByRole("button", { name: "Update password" }).click();
}

test("an app sign-in with a breached password changes it first, then goes on to the app", async ({ api, adminApi, page }) => {
  const user = await createUser(api, "breached");
  await markBreached(user.email);
  const client = await createClient(adminApi, { scope: "openid email" });
  const callback = await interceptCallback(page);
  const { challenge } = pkce();
  await page.goto(authorizeUrl(client, { scope: "openid email", challenge }));
  await page.waitForURL(/\/login/);
  await loginViaUi(page, user.email, user.password, false);
  await page.waitForURL(/\/change-password\?/);
  await changePassword(page, user.password);

  // Resumes the authorization at once: consent, then the app.
  await page.waitForURL(/\/consent/);
  await page.getByRole("button", { name: "Allow" }).click();
  expect((await callback()).searchParams.get("code")).toBeTruthy();
  expect(await query(`select 1 from password_breach where user_id = $1`, [await userIdOf(user.email)])).toHaveLength(0);
});

test("the account page sends a breached password to the change step", async ({ api, page }) => {
  const user = await createUser(api, "breached-dash");
  await markBreached(user.email);
  await loginViaUi(page, user.email, user.password);
  await page.waitForURL(/\/change-password$/);
  await changePassword(page, user.password);
  await expect(page.getByRole("main").getByText("Password changed", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Go to your account" }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto("/en/dashboard/activity");
  await expect(page.getByRole("list", { name: "Recent activity" }).getByText("Password changed")).toBeVisible();
});
