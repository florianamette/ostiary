import { randomBytes } from "node:crypto";

import { query } from "../support/db";
import { AUTH_URL, MOCK_URL } from "../support/env";
import { expect, test } from "../support/fixtures";
import { openProvider, startSocialSignIn, upsertProviderRow, waitForSocialProvider } from "../support/social";

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
