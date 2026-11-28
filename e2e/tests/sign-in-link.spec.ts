import { createUser } from "../support/auth";
import { expect, test } from "../support/fixtures";
import { waitForEmail } from "../support/mail";
import { authorizeUrl, createClient, interceptCallback, pkce } from "../support/oauth";

/* The sign-in code email's button (sign-in-link.ts): one click on its page signs in, once. */

async function askForCode(page: import("@playwright/test").Page, email: string) {
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
}

test("the link in the sign-in code email signs in, and only once", async ({ api, browser, page }) => {
  const user = await createUser(api, "link");
  const since = Date.now() - 1000;
  await page.goto("/en/login");
  await askForCode(page, user.email);
  const mail = await waitForEmail(user.email, "sign-in", since);
  expect(mail.code).toMatch(/^\d{6}$/);
  expect(mail.url).toMatch(/\/en\/sign-in-link\?token=/);

  // Read on another device: opening the page signs nothing in, the button does.
  const phone = await browser.newContext();
  const other = await phone.newPage();
  await other.goto(mail.url!);
  await expect(other.getByText(`Sign in as ${user.email}`)).toBeVisible();
  expect((await phone.cookies()).some((c) => c.name.endsWith("session_token"))).toBe(false);
  await other.getByRole("button", { name: "Sign in" }).click();
  await other.waitForURL(/\/en\/dashboard/);

  await other.goto(mail.url!);
  await expect(other.getByText("This link no longer works")).toBeVisible();
  await phone.close();
});

test("the link resumes an app's sign-in", async ({ api, adminApi, page }) => {
  const user = await createUser(api, "linkapp");
  const client = await createClient(adminApi, { scope: "openid email" });
  const callback = await interceptCallback(page);
  const { challenge } = pkce();
  await page.goto(authorizeUrl(client, { scope: "openid email", challenge }));
  await page.waitForURL(/\/login/);
  const since = Date.now() - 1000;
  await askForCode(page, user.email);
  const mail = await waitForEmail(user.email, "sign-in", since);

  await page.goto(mail.url!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/consent/);
  await page.getByRole("button", { name: "Allow" }).click();
  expect((await callback()).searchParams.get("code")).toBeTruthy();
});
