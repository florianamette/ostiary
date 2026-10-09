import { expect, test } from "../support/fixtures";
import { authorizeUrl, createClient, pkce } from "../support/oauth";

/*
 * Per-app branding: the login page names the app only for a genuine authorization (the query
 * Better Auth signs when it redirects to /login), never for a bare ?client_id= anyone can type.
 */
test("the login page names the app for a signed authorization only", async ({ adminApi, page }) => {
  const client = await createClient(adminApi, { scope: "openid profile email" });

  await page.goto(authorizeUrl(client, { scope: "openid profile email", challenge: pkce().challenge }));
  await page.waitForURL(/\/login\?.*sig=/);
  await expect(page.getByText(`Sign in to continue to ${client.client_name}`)).toBeVisible();

  await page.goto(`/en/login?client_id=${encodeURIComponent(client.client_id)}`);
  await expect(page.getByText("Login to your account")).toBeVisible();
  await expect(page.getByText(/Sign in to continue to/)).toHaveCount(0);
  await expect(page.getByText(client.client_name!)).toHaveCount(0);
});
