import { randomBytes } from "node:crypto";

import { createUser, loginViaUi } from "../support/auth";
import { freshTotp, secretFromUri } from "../support/totp";
import { AUTH_URL } from "../support/env";
import { query } from "../support/db";
import { expect, test } from "../support/fixtures";
import { authorizeUrl, createClient, interceptCallback, pkce } from "../support/oauth";

/*
 * Two-factor authentication required for an organization's members (two-factor-policy.ts).
 * An app sign-in without it stops at /two-factor/required: during the grace period the person
 * may go on ("Remind me later"); after it they turn it on first, then the sign-in resumes.
 */

test("an organization requires two-factor: a reminder during the grace period, then required", async ({ adminPage, adminApi, api, page }) => {
  const user = await createUser(api, "org2fa");
  const orgId = `org2fa-${randomBytes(4).toString("hex")}`;
  const [row] = await query<{ id: string }>(`select id from "user" where email = $1`, [user.email]);
  await query(`insert into organization (id, name, slug, created_at) values ($1, $2, $1, now())`, [orgId, `2FA ${orgId}`]);
  await query(`insert into member (id, organization_id, user_id, role, created_at) values ($1, $2, $3, 'member', now())`, [`${orgId}-m`, orgId, row!.id]);

  await adminPage.goto(`/en/organizations/${orgId}`);
  await adminPage.getByRole("checkbox", { name: "Require two-factor authentication for members" }).check();
  await expect(adminPage.getByText("Two-factor authentication is now required")).toBeVisible();

  const client = await createClient(adminApi, { scope: "openid email" });
  const signIn = async () => {
    const { challenge } = pkce();
    await page.goto(authorizeUrl(client, { scope: "openid email", challenge }));
  };

  // Grace period: reminded, and allowed to go on to the app.
  const callback = await interceptCallback(page);
  await signIn();
  await page.waitForURL(/\/login/);
  await loginViaUi(page, user.email, user.password, false);
  await page.waitForURL(/\/two-factor\/required/);
  await expect(page.getByText("Your organization's administrators require two-factor authentication")).toBeVisible();
  await page.getByRole("button", { name: "Remind me later" }).click();
  await page.waitForURL(/\/consent/);
  await page.getByRole("button", { name: "Allow" }).click();
  expect((await callback()).searchParams.get("code")).toBeTruthy();
  // Let that redirect finish loading, or it interrupts the next sign-in's navigation.
  await page.waitForURL(/\/callback\?/);

  // After the grace period (it runs from the requirement, or the account's creation if later).
  await query(`update organization_policy set require_two_factor_since = now() - interval '30 days' where organization_id = $1`, [orgId]);
  await query(`update "user" set created_at = now() - interval '30 days' where id = $1`, [row!.id]);
  await signIn();
  await page.waitForURL(/\/two-factor\/required/);
  await expect(page.getByText("Turn it on to continue.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remind me later" })).toHaveCount(0);
  await page.getByRole("link", { name: "Set up two-factor authentication" }).click();
  await page.waitForURL(/\/dashboard\?continue=/);

  // Once it is on, coming back to the prompt resumes the sign-in (consent was given above).
  const origin = { origin: AUTH_URL };
  const enabled = await page.request.post("/api/auth/two-factor/enable", { data: { password: user.password }, headers: origin });
  expect(enabled.status(), await enabled.text()).toBe(200);
  const secret = secretFromUri(((await enabled.json()) as { totpURI: string }).totpURI);
  const verified = await page.request.post("/api/auth/two-factor/verify-totp", { data: { code: await freshTotp(secret) }, headers: origin });
  expect(verified.status(), await verified.text()).toBe(200);
  const resume = new URL(page.url()).searchParams.get("continue")!;
  expect(resume).toMatch(/^\/en\/two-factor\/required\?/);
  const second = await interceptCallback(page);
  await page.goto(resume);
  expect((await second()).searchParams.get("code")).toBeTruthy();
});
