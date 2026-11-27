import { createUser, enableTotp, getSession, loginViaUi } from "../support/auth";
import { query, userIdOf } from "../support/db";
import { expect, test } from "../support/fixtures";

/* "Recent activity" on the account page: what it lists, and signing out a session from it. */

test("recent activity lists sign-ins and changes, and signs out another session", async ({ api, page }) => {
  const user = await createUser(api, "activity");
  await loginViaUi(page, user.email, user.password);
  await page.waitForURL(/\/dashboard/);
  const changed = await api.post("/api/auth/change-password", {
    data: { currentPassword: user.password, newPassword: `${user.password}-2` },
  });
  expect(changed.status(), await changed.text()).toBe(200);

  // A fresh load (the page is already on the dashboard: a hash change alone would not read it).
  await page.reload();
  const activity = page.getByRole("list", { name: "Recent activity" });
  await expect(activity.getByText("Password changed")).toBeVisible();
  await expect(activity.getByText("Signed in")).toHaveCount(2);
  await expect(activity.getByText("This browser")).toHaveCount(1);

  // The API client's session (the other sign-in) can be signed out from its row.
  await activity.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("Session signed out.")).toBeVisible();
  expect(await getSession(api)).toBeNull();
  await expect(activity.getByText("A session signed out")).toBeVisible();
  await expect(activity.getByRole("button", { name: "Sign out" })).toHaveCount(0);
});

test("turning on two-factor authentication is in the account's activity", async ({ api }) => {
  const user = await createUser(api, "activity2fa");
  await enableTotp(api, user.password);
  const rows = await query<{ type: string }>(`select type from account_event where user_id = $1 order by created_at`, [
    await userIdOf(user.email),
  ]);
  expect(rows.map((r) => r.type)).toEqual(["sign_in", "two_factor_enabled"]);
});
