import { createUser, getSession, loginViaUi } from "../support/auth";
import { expect, test } from "../support/fixtures";
import { readEmails, waitForEmail } from "../support/mail";

/* Sign-in from a browser the account has not used: the email, and its "This wasn't me" button. */

const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0";

test("a sign-in from another browser emails the person, and 'This wasn't me' locks the account", async ({ api, browser }) => {
  // Signs up and verifies through the API client: the account's first device.
  const user = await createUser(api, "device");
  const since = Date.now() - 1000;

  // Another browser: its own User-Agent, address and cookies. (The same browser and address as
  // an open session would count as known: a cleared cookie.)
  const context = await browser.newContext({ userAgent: FIREFOX, extraHTTPHeaders: { "x-forwarded-for": "10.250.1.2" } });
  const page = await context.newPage();
  await loginViaUi(page, user.email, user.password);
  await page.waitForURL(/\/dashboard/);
  const mail = await waitForEmail(user.email, "new-device", since);
  expect(mail.subject).toContain("New sign-in");
  expect(mail.url).toMatch(/\/en\/secure-account\?token=/);

  // The same browser again: known now, no second email.
  await page.context().clearCookies({ name: /session_token/ });
  await loginViaUi(page, user.email, user.password);
  await page.waitForURL(/\/dashboard/);
  expect(readEmails().filter((m) => m.to === user.email && m.kind === "new-device")).toHaveLength(1);

  // Opening the link changes nothing until the button is pressed.
  const resetSince = Date.now() - 1000;
  await page.goto(mail.url!);
  await expect(page.getByRole("main").getByText("Secure your account")).toBeVisible();
  expect(await getSession(api)).not.toBeNull();
  await page.getByRole("button", { name: "Sign out everywhere and reset my password" }).click();
  await expect(page.getByRole("main").getByText("Check your inbox")).toBeVisible();

  // Every session is gone, and a password reset link is on its way.
  expect(await getSession(api)).toBeNull();
  await waitForEmail(user.email, "password reset", resetSince);

  // The link works once.
  await page.goto(mail.url!);
  await expect(page.getByRole("main").getByText("This link has expired or was already used.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out everywhere and reset my password" })).toHaveCount(0);
  await context.close();
});
