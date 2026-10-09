import { createUser, enableTotp, getSession } from "../support/auth";
import { query } from "../support/db";
import { ADMIN_URL, AUTH_URL, GATE_ADMIN_EMAIL } from "../support/env";
import { expect, test } from "../support/fixtures";

/* REQUIRE_ADMIN_2FA: an admin without two-factor authentication cannot use the console or the admin endpoints. */
test("admins must turn on two-factor authentication before using the console", async ({ api, browser, clientIp }) => {
  expect(GATE_ADMIN_EMAIL, "a second address in ADMIN_EMAILS").toBeTruthy();
  await query(`delete from "user" where email = $1`, [GATE_ADMIN_EMAIL]);
  const admin = await createUser(api, "gate", GATE_ADMIN_EMAIL);
  expect((await getSession(api))?.user).toMatchObject({ role: "admin", twoFactorEnabled: false });

  const blocked = await api.get(`${ADMIN_URL}/api/auth/admin/list-users`, { headers: { origin: ADMIN_URL } });
  expect(blocked.status()).toBe(403);
  expect(await blocked.json()).toMatchObject({ code: "TWO_FACTOR_REQUIRED" });

  let context = await browser.newContext({ storageState: await api.storageState(), extraHTTPHeaders: { "x-forwarded-for": clientIp } });
  let page = await context.newPage();
  await page.goto(`${ADMIN_URL}/en/users`);
  await expect(page).toHaveURL(`${AUTH_URL}/en/dashboard#two-factor`);
  await context.close();

  await enableTotp(api, admin.password);
  const allowed = await api.get(`${ADMIN_URL}/api/auth/admin/list-users`, { headers: { origin: ADMIN_URL } });
  expect(allowed.status(), await allowed.text()).toBe(200);

  context = await browser.newContext({ storageState: await api.storageState(), extraHTTPHeaders: { "x-forwarded-for": clientIp } });
  page = await context.newPage();
  await page.goto(`${ADMIN_URL}/en/users`);
  await expect(page).toHaveURL(`${ADMIN_URL}/en/users`);
  await expect(page.getByRole("heading", { name: "Users", level: 1 })).toBeVisible();
  await context.close();
});
