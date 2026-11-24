import { query } from "../support/db";
import { expect, test } from "../support/fixtures";
import { clientCredentials, createClient, ENV_API, waitForScope, type Client } from "../support/oauth";

/*
 * Rotating a client secret with a grace period (client-secret-grace.ts): the previous secret
 * keeps working until it ends, the console shows until when, and an admin can end it early.
 */

test("a rotated secret keeps working during its grace period, then stops", async ({ api, adminApi, adminPage }) => {
  const scope = ENV_API.scopes[0]!;
  await waitForScope(api, scope);
  const old = await createClient(adminApi, { redirect_uris: [], grant_types: ["client_credentials"], scope, resources: [ENV_API.identifier] });
  const works = async (client: Client) => (await clientCredentials(api, client, scope, ENV_API.identifier)).status();
  const rotate = async (grace?: string) => {
    const response = await adminApi.post(`/api/admin/oauth-clients/${encodeURIComponent(old.client_id)}/rotate-secret`, { data: grace ? { grace } : {} });
    expect(response.status(), await response.text()).toBe(200);
    const { data } = (await response.json()) as { data: { client_secret: string; previous_secret_expires_at?: number } };
    return data;
  };

  // 1 hour: both secrets work.
  const first = await rotate("1h");
  const current: Client = { ...old, client_secret: first.client_secret };
  expect(first.previous_secret_expires_at! * 1000).toBeGreaterThan(Date.now() + 59 * 60_000);
  expect(await works(current)).toBe(200);
  expect(await works(old)).toBe(200);

  // The console shows it, and the list endpoint says until when.
  const grace = (await (await adminApi.get("/api/admin/oauth-client-secrets")).json()) as { data: Record<string, string> };
  expect(new Date(grace.data[old.client_id]!).getTime()).toBe(first.previous_secret_expires_at! * 1000);
  await adminPage.goto(`/en/applications?q=${encodeURIComponent(old.client_name!)}`);
  await expect(adminPage.getByRole("row").filter({ hasText: old.client_name! }).getByText(/Previous secret valid until/)).toBeVisible();

  // Once the grace period is over, the previous secret is refused.
  await query(`update oauth_client set client_secret = regexp_replace(client_secret, ':[0-9]+$', ':' || (extract(epoch from now())::bigint - 1)) where client_id = $1`, [old.client_id]);
  expect(await works(old)).toBe(401);
  expect(await works(current)).toBe(200);

  // Revoked early from the console: the previous secret stops at once.
  const second = await rotate("7d");
  const next: Client = { ...old, client_secret: second.client_secret };
  expect(await works(current)).toBe(200);
  const revoked = await adminApi.delete(`/api/admin/oauth-clients/${encodeURIComponent(old.client_id)}/previous-secret`);
  expect(revoked.status(), await revoked.text()).toBe(200);
  expect(await works(current)).toBe(401);
  expect(await works(next)).toBe(200);

  // Without a grace period (the default), the previous secret stops at once.
  const third = await rotate();
  expect(third.previous_secret_expires_at).toBeUndefined();
  expect(await works(next)).toBe(401);
  expect(await works({ ...old, client_secret: third.client_secret })).toBe(200);
  expect((await adminApi.post(`/api/admin/oauth-clients/${encodeURIComponent(old.client_id)}/rotate-secret`, { data: { grace: "1y" } })).status()).toBe(400);
});
