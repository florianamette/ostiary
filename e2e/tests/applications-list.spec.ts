import { query } from "../support/db";
import { expect, test } from "../support/fixtures";
import { createClient } from "../support/oauth";

/*
 * The Applications page lists every admin-registered app (#103): Better Auth's
 * /oauth2/get-clients stops at 100, the console's own route does not.
 */
test("the Applications page lists every app, past Better Auth's 100", async ({ adminApi, adminPage }) => {
  // Enough apps to pass 100 (rows written directly: a hundred creations would hit the admin
  // API's write limit), then one registered from the console to look for.
  const prefix = `e2e-list-${Date.now()}`;
  await query(
    // Admin-registered, so they do not count against the hourly self-registration limit.
    `insert into oauth_client (id, client_id, name, reference_id, redirect_uris, admin_registered, created_at)
     select $1 || '-' || i, $1 || '-' || i, 'e2e filler ' || i, 'ostiary:platform', '{}', true, now() from generate_series(1, 101) as i`,
    [prefix],
  );
  const last = await createClient(adminApi, {});

  const listed = await adminApi.get("/api/admin/oauth-clients");
  expect(listed.status()).toBe(200);
  const { data } = (await listed.json()) as { data: { client_id: string; client_secret?: string }[] };
  expect(data.length).toBeGreaterThan(100);
  expect(data.some((c) => c.client_id === last.client_id)).toBe(true);
  expect(data.every((c) => c.client_secret === undefined)).toBe(true);

  await adminPage.goto(`/en/applications?q=${encodeURIComponent(last.client_name!)}`);
  await expect(adminPage.getByRole("row").filter({ hasText: last.client_name! })).toHaveCount(1);

  await query(`delete from oauth_client where client_id like $1 || '-%'`, [prefix]);
});
