import { createUser, getSession, signInWithPassword } from "../support/auth";
import { query } from "../support/db";
import { expect, test } from "../support/fixtures";

/*
 * The session and password policy (admin console, Security; lib/auth-policy.ts). It changes
 * sign-up and password rules for everyone, so it runs in the platform-settings project, after
 * every other test, and puts the defaults back.
 */

const HOUR = 3_600_000;

test("the session and password policy applies to sign-up, passwords and new sessions", async ({ adminPage, api, newApi, page }) => {
  const user = await createUser(api, "policy");
  try {
    await adminPage.goto("/en/security");
    await adminPage.getByRole("button", { name: "Edit" }).click();
    const dialog = adminPage.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Session lifetime" }).click();
    await adminPage.getByRole("option", { name: "1 day", exact: true }).click();
    await dialog.getByRole("checkbox", { name: "Extend sessions while in use" }).uncheck();
    await dialog.getByRole("checkbox", { name: "Sign out everywhere on a password change" }).check();
    await dialog.getByRole("combobox", { name: "Minimum password length" }).click();
    await adminPage.getByRole("option", { name: "16 characters" }).click();
    await dialog.getByRole("checkbox", { name: "Password sign-up" }).uncheck();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(adminPage.getByText("Policy saved.")).toBeVisible();

    // The auth app picks the policy up within a minute.
    const closed = page.getByText(/Sign-up with a password is off|New accounts cannot be created here/);
    await expect
      .poll(async () => {
        await page.goto("/en/signup");
        return closed.isVisible();
      }, { timeout: 80_000, intervals: [3_000, 5_000] })
      .toBe(true);
    await expect(page.getByRole("textbox", { name: "Password", exact: true })).toHaveCount(0);
    const signUp = await (await newApi()).post("/api/auth/sign-up/email", {
      data: { email: `policy-${Date.now()}@e2e.test`, password: "E2e-long-enough-password-1", name: "Policy", username: `policy_${Date.now()}` },
    });
    expect(signUp.status()).toBe(400);

    // A new session lasts a day, not extended.
    const other = await newApi();
    expect((await signInWithPassword(other, user.email, user.password)).status()).toBe(200);
    const [session] = await query<{ expires_at: Date }>(
      `select s.expires_at from session s join "user" u on u.id = s.user_id where u.email = $1 order by s.created_at desc limit 1`,
      [user.email],
    );
    expect(Math.abs(new Date(session!.expires_at).getTime() - (Date.now() + 24 * HOUR))).toBeLessThan(HOUR);

    // A password shorter than 16 characters is refused; a change signs the account out elsewhere.
    const short = await api.post("/api/auth/change-password", { data: { currentPassword: user.password, newPassword: "Short-pass-12" } });
    expect(short.status()).toBe(400);
    const changed = await api.post("/api/auth/change-password", {
      data: { currentPassword: user.password, newPassword: `${user.password}-changed`, revokeOtherSessions: false },
    });
    expect(changed.status(), await changed.text()).toBe(200);
    expect(await getSession(other)).toBeNull();
    expect((await getSession(api))?.user.email).toBe(user.email);
  } finally {
    // Back to the defaults; nothing runs after this project.
    await query(`delete from app_setting where key = 'auth_policy'`);
  }
});
