import { randomInt } from "node:crypto";

import { createUser, enableTotp, getSession, loginViaUi } from "../support/auth";
import { query } from "../support/db";
import { expect, test } from "../support/fixtures";
import { AUTH_URL } from "../support/env";
import { readEmails, waitForEmail } from "../support/mail";

/*
 * Sign-in with a code sent by text message (Better Auth's phone-number plugin; sms.ts). In the
 * end-to-end environment E2E_SMS turns it on and the texts are captured like emails.
 */

const newNumber = () => `+3361${String(randomInt(10_000_000)).padStart(7, "0")}`;

test("a person adds a phone number from the account page, then signs in with a texted code", async ({ page, api, newApi, browser, clientIp }) => {
  const user = await createUser(api, "sms");
  const phone = newNumber();

  // The account page texts a code to the new number and saves it once typed.
  await loginViaUi(page, user.email, user.password);
  await page.waitForURL(/\/dashboard/);
  await page.goto("/en/dashboard/profile");
  await page.getByRole("button", { name: "Add a phone number" }).click();
  await page.getByRole("textbox", { name: "Phone number" }).fill(phone);
  const sentAt = Date.now() - 1000;
  await page.getByRole("button", { name: "Send code" }).click();
  const added = await waitForEmail(phone, "sign-in-code", sentAt);
  await page.getByRole("textbox", { name: `Code texted to ${phone}` }).fill(added.code!);
  await page.getByRole("button", { name: "Save number" }).click();
  await expect(page.getByText("Phone number saved.")).toBeVisible();
  const [row] = await query<{ phone_number: string; phone_number_verified: boolean }>(`select phone_number, phone_number_verified from "user" where email = $1`, [user.email]);
  expect(row).toEqual({ phone_number: phone, phone_number_verified: true });

  // Signing in with it, in another browser.
  const otherContext = await browser.newContext({ baseURL: AUTH_URL, extraHTTPHeaders: { "x-forwarded-for": clientIp } });
  const other = await otherContext.newPage();
  await other.goto("/en/login");
  await other.getByRole("button", { name: "Text me a sign-in code" }).click();
  await other.getByRole("textbox", { name: "Phone number" }).fill(phone);
  const signInAt = Date.now();
  await other.getByRole("button", { name: "Send code" }).click();
  const text = await waitForEmail(phone, "sign-in-code", signInAt);
  expect(text.subject).toContain(text.code!);
  await other.getByRole("textbox", { name: "Sign-in code" }).fill(text.code!);
  await other.waitForURL(/\/dashboard/);
  await otherContext.close();

  // The profile update cannot set a number: only a texted code can.
  const refused = await api.post("/api/auth/update-user", { data: { phoneNumber: newNumber() } });
  expect(refused.status()).toBe(400);

  // An account with two-factor authentication still gets its second step.
  await enableTotp(api, user.password);
  const anonymous = await newApi();
  const at = Date.now();
  expect((await anonymous.post("/api/auth/phone-number/send-otp", { data: { phoneNumber: phone } })).status()).toBe(200);
  const second = await waitForEmail(phone, "sign-in-code", at);
  const verified = await anonymous.post("/api/auth/phone-number/verify", { data: { phoneNumber: phone, code: second.code } });
  expect(verified.status(), await verified.text()).toBe(200);
  expect(await verified.json()).toMatchObject({ twoFactorRedirect: true });
  expect(await getSession(anonymous)).toBeNull();
});

test("texted codes go only to numbers an account verified, and phone passwords are off", async ({ newApi }) => {
  const anonymous = await newApi();
  const stranger = newNumber();
  const before = Date.now() - 1000;
  // Same answer as for a known number, but nothing is sent.
  expect((await anonymous.post("/api/auth/phone-number/send-otp", { data: { phoneNumber: stranger } })).status()).toBe(200);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(readEmails().filter((m) => m.to === stranger && Date.parse(m.at) >= before)).toEqual([]);
  // Not a phone number.
  expect((await anonymous.post("/api/auth/phone-number/send-otp", { data: { phoneNumber: "0612345678" } })).status()).toBe(400);
  // The plugin's password sign-in and texted password reset are disabled.
  expect((await anonymous.post("/api/auth/sign-in/phone-number", { data: { phoneNumber: stranger, password: "x" } })).status()).toBe(404);
  expect((await anonymous.post("/api/auth/phone-number/request-password-reset", { data: { phoneNumber: stranger } })).status()).toBe(404);
});
