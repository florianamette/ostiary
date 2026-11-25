import { randomBytes } from "node:crypto";

import { query } from "../support/db";
import { MOCK_URL } from "../support/env";
import { expect, test } from "../support/fixtures";
import { waitForSocialProvider } from "../support/social";

/*
 * Custom OpenID Connect sign-in providers (custom-oauth-providers.ts), added from the admin
 * console and built with Better Auth's generic-oauth plugin. The provider is the mock server's
 * /oidc (discovery, PKCE, ES256 ID tokens).
 */

test("an admin adds an OpenID Connect provider, and people sign up and in with it", async ({ adminPage, api, page, request }) => {
  const slug = `acme-${randomBytes(3).toString("hex")}`;
  const id = `oidc-${slug}`;
  const name = `Acme ${slug.slice(5)}`;
  await adminPage.goto("/en/sign-in-providers");
  await adminPage.getByRole("button", { name: "Add provider" }).click();
  const dialog = adminPage.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Button name" }).fill(name);
  await dialog.getByRole("textbox", { name: "Provider ID" }).fill(slug);
  await expect(dialog.getByRole("textbox", { name: "Redirect URI" })).toHaveValue(new RegExp(`/api/auth/callback/${id}$`));
  // Not a URL Ostiary may fetch: refused before anything is saved.
  await dialog.getByRole("textbox", { name: "Discovery URL" }).fill("https://10.0.0.1/.well-known/openid-configuration");
  await dialog.getByRole("textbox", { name: "Client ID" }).fill("e2e-oidc-client");
  await dialog.getByLabel("Client secret").fill("e2e-oidc-secret");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(adminPage.getByText(/Discovery URL: /)).toBeVisible();
  await dialog.getByRole("textbox", { name: "Discovery URL" }).fill(`${MOCK_URL}/oidc/.well-known/openid-configuration`);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(adminPage.getByText("Provider saved.")).toBeVisible();
  await expect(adminPage.getByText(name, { exact: true })).toBeVisible();

  try {
    await waitForSocialProvider(api, id, true);

    // A new person signs up with it.
    const email = `${slug}@e2e.test`;
    await request.post(`${MOCK_URL}/oidc/next-profile`, {
      data: { sub: `acme|${slug}`, email, email_verified: true, name: "Acme Person" },
    });
    await page.goto("/en/login");
    await page.getByRole("button", { name: `Continue with ${name}` }).click();
    await page.waitForURL(/\/dashboard/);
    const accounts = await query<{ provider_id: string; account_id: string }>(
      `select a.provider_id, a.account_id from account a join "user" u on u.id = a.user_id where u.email = $1`,
      [email],
    );
    expect(accounts).toEqual([{ provider_id: id, account_id: `acme|${slug}` }]);

    // Its settings can be changed later (the secret is kept when left empty).
    await adminPage.reload();
    await adminPage.getByRole("button", { name: `Edit ${name}` }).click();
    await adminPage.getByRole("dialog").getByRole("checkbox", { name: "Create accounts for new users" }).uncheck();
    await adminPage.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(adminPage.getByText("Provider saved.")).toBeVisible();
    const [row] = await query<{ allow_sign_up: boolean; secrets: string | null }>(`select allow_sign_up, secrets from social_provider where id = $1`, [id]);
    expect(row?.allow_sign_up).toBe(false);
    expect(row?.secrets).toBeTruthy();

    // The provider later points its token endpoint at the private network: the next build of
    // the provider checks the discovery document again and leaves it out.
    await request.post(`${MOCK_URL}/oidc/discovery-override`, { data: { token_endpoint: "https://10.0.0.1/token" } });
    await query(`update social_provider set updated_at = now() where id = $1`, [id]);
    await waitForSocialProvider(api, id, false);
  } finally {
    await request.post(`${MOCK_URL}/oidc/discovery-override`, { data: {} });
    await query(`delete from social_provider where id = $1`, [id]);
  }
  await waitForSocialProvider(api, id, false);
});
