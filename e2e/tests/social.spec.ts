import { randomBytes } from "node:crypto";

import { createUser, enableTotp, getSession } from "../support/auth";
import { query } from "../support/db";
import { AUTH_URL, MOCK_URL, env } from "../support/env";
import { expect, test } from "../support/fixtures";
import { openProvider, startSocialSignIn, upsertProviderRow, waitForSocialProvider } from "../support/social";
import { freshTotp } from "../support/totp";

/*
 * Social providers switched on at runtime (social-providers.ts): syncSocialProviders swaps
 * Better Auth's provider list in its context before each request. These tests share the
 * social_provider table, so they run one after the other.
 */
test.describe.configure({ mode: "serial" });

test("a provider turned on in the console signs in without a restart, and off refuses", async ({ adminPage, api, page }) => {
  const clientId = `e2e-github-${randomBytes(4).toString("hex")}`;
  // Start from "never set up" (a previous run on the same database may have left it on).
  await query(`delete from social_provider where id = 'github'`);
  await waitForSocialProvider(api, "github", false);

  let dialog = await openProvider(adminPage, "GitHub");
  await dialog.getByLabel("Client ID").fill(clientId);
  await dialog.getByLabel("Client secret").fill("e2e-dummy-secret");
  await dialog.getByRole("checkbox", { name: "Show on the sign-in page" }).check();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(adminPage.getByText("GitHub is on")).toBeVisible();

  // The auth app (another process) reloads its providers within 30 seconds.
  await waitForSocialProvider(api, "github", true);
  const { body } = await startSocialSignIn(api, "github");
  const url = new URL(body.url!);
  expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
  expect(url.searchParams.get("client_id")).toBe(clientId);
  expect(url.searchParams.get("redirect_uri")).toBe(`${AUTH_URL}/api/auth/callback/github`);
  expect(url.searchParams.get("state")).toBeTruthy();

  await page.goto("/en/login");
  await expect(page.getByRole("button", { name: /GitHub/ })).toBeVisible();

  dialog = await openProvider(adminPage, "GitHub");
  await dialog.getByRole("checkbox", { name: "Show on the sign-in page" }).uncheck();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(adminPage.getByText("GitHub saved")).toBeVisible();

  await waitForSocialProvider(api, "github", false);
  const refused = await startSocialSignIn(api, "github");
  expect(refused.status).toBeGreaterThanOrEqual(400);
  await page.goto("/en/login");
  await expect(page.getByRole("button", { name: /GitHub/ })).toHaveCount(0);
});

test("full social sign-in against a local OAuth provider", async ({ api, page, request }) => {
  const id = randomBytes(4).toString("hex");
  const email = `gitlab-${id}@e2e.test`;
  await upsertProviderRow("gitlab", { issuer: `${MOCK_URL}/gitlab` }, { clientId: `e2e-gitlab-${id}`, clientSecret: "e2e-gitlab-secret" });
  await waitForSocialProvider(api, "gitlab", true);

  // The mock provider signs in whoever the test chooses.
  await request.post(`${MOCK_URL}/gitlab/next-profile`, {
    data: { id: Number.parseInt(id, 16), username: `gl_${id}`, name: `GitLab ${id}`, email, email_verified: true },
  });

  // In the browser: the sign-in page's button starts it, the mock redirects back to the callback.
  await page.goto("/en/login");
  await page.getByRole("button", { name: /GitLab/ }).click();
  await page.waitForURL(/\/dashboard/);

  const session = await page.request.get("/api/auth/get-session");
  expect((await session.json()).user).toMatchObject({ email, name: `GitLab ${id}`, emailVerified: true });
  const accounts = await query<{ provider_id: string }>(
    `select a.provider_id from account a join "user" u on u.id = a.user_id where u.email = $1`,
    [email],
  );
  expect(accounts.map((a) => a.provider_id)).toEqual(["gitlab"]);

  await query(`update social_provider set enabled = false where id = 'gitlab'`);
  await waitForSocialProvider(api, "gitlab", false);
});

/** The third ADMIN_EMAILS address (.env.test), for social sign-ups. */
const SOCIAL_ADMIN_EMAIL = (env.ADMIN_EMAILS ?? "").split(",")[2]?.trim() ?? "";

async function enableGitlab(api: import("@playwright/test").APIRequestContext) {
  await upsertProviderRow("gitlab", { issuer: `${MOCK_URL}/gitlab` }, { clientId: "e2e-gitlab-security", clientSecret: "e2e-gitlab-secret" });
  await waitForSocialProvider(api, "gitlab", true);
}

/** Signs in with the GitLab mock in the browser, as the given profile. */
async function gitlabSignIn(page: import("@playwright/test").Page, request: import("@playwright/test").APIRequestContext, profile: Record<string, unknown>) {
  await request.post(`${MOCK_URL}/gitlab/next-profile`, { data: profile });
  await page.goto("/en/login");
  await page.getByRole("button", { name: /GitLab/ }).click();
}

test("ADMIN_EMAILS: a social sign-up is admin only when the provider verified the address", async ({ api, page, request }) => {
  expect(SOCIAL_ADMIN_EMAIL, "a third address in ADMIN_EMAILS").toBeTruthy();
  await query(`delete from "user" where email = $1`, [SOCIAL_ADMIN_EMAIL]);
  await enableGitlab(api);
  const id = Number.parseInt(randomBytes(3).toString("hex"), 16);

  await gitlabSignIn(page, request, { id, username: `gl_${id}`, name: "Not verified", email: SOCIAL_ADMIN_EMAIL, email_verified: false });
  await page.waitForURL(/\/en(\/dashboard)?$/);
  let [row] = await query<{ role: string | null; email_verified: boolean }>(`select role, email_verified from "user" where email = $1`, [SOCIAL_ADMIN_EMAIL]);
  expect(row).toEqual({ role: "user", email_verified: false });

  await query(`delete from "user" where email = $1`, [SOCIAL_ADMIN_EMAIL]);
  await page.context().clearCookies();
  await gitlabSignIn(page, request, { id: id + 1, username: `gl_${id + 1}`, name: "Verified", email: SOCIAL_ADMIN_EMAIL, email_verified: true });
  await page.waitForURL(/\/en(\/dashboard)?$/);
  [row] = await query<{ role: string | null; email_verified: boolean }>(`select role, email_verified from "user" where email = $1`, [SOCIAL_ADMIN_EMAIL]);
  expect(row).toEqual({ role: "admin", email_verified: true });
  await query(`delete from "user" where email = $1`, [SOCIAL_ADMIN_EMAIL]);
});

test("two-factor authentication: a social sign-in asks for the code, and never links into the account implicitly", async ({ api, page, request }) => {
  const user = await createUser(api, "tfa-social");
  const secret = await enableTotp(api, user.password);
  await enableGitlab(api);
  const id = Number.parseInt(randomBytes(3).toString("hex"), 16);
  const profile = { id, username: `gl_${id}`, name: user.name, email: user.email, email_verified: true };

  // Same verified email: Better Auth would attach GitLab to the account; refused for 2FA accounts.
  await gitlabSignIn(page, request, profile);
  await page.waitForURL(/error=account_not_linked/);
  await expect(page.getByRole("alert").filter({ hasText: "isn't connected" })).toBeVisible();
  expect(await getSession(page.request)).toBeNull();
  const providers = async () =>
    (await query<{ provider_id: string }>(`select a.provider_id from account a join "user" u on u.id = a.user_id where u.email = $1 order by 1`, [user.email])).map((a) => a.provider_id);
  expect(await providers()).toEqual(["credential"]);

  // Connected explicitly (as "Connect GitLab" on the dashboard does): the sign-in stops for the code.
  const [owner] = await query<{ id: string }>(`select id from "user" where email = $1`, [user.email]);
  await query(
    `insert into account (id, account_id, provider_id, user_id, created_at, updated_at) values ($1, $2, 'gitlab', $3, now(), now())`,
    [`acc_${randomBytes(6).toString("hex")}`, String(id), owner!.id],
  );
  await gitlabSignIn(page, request, profile);
  await page.waitForURL(/\/two-factor/);
  expect(await getSession(page.request)).toBeNull();
  await page.locator("#two-factor-code").fill(await freshTotp(secret));
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL((url) => !url.pathname.includes("two-factor"));
  expect((await getSession(page.request))?.user.email).toBe(user.email);

  await query(`update social_provider set enabled = false where id = 'gitlab'`);
  await waitForSocialProvider(api, "gitlab", false);
});
