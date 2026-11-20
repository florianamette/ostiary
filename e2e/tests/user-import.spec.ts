import { hashSync } from "bcryptjs";

import { createUser, expectSignedInAs, newUser, signInWithPassword } from "../support/auth";
import { query } from "../support/db";
import { ADMIN_URL } from "../support/env";
import { expect, test } from "../support/fixtures";

/*
 * Bulk import from an Auth0 export (docs/import-users.md): the dry run, the import, a sign-in
 * with the bcrypt hash Auth0 exported, which then becomes a scrypt hash, and an address that
 * already has an account, which is skipped and left alone.
 */

const PUBLIC_ORGANIZATION_ID = "org_public_b2c";

async function storedPassword(email: string): Promise<string> {
  const [row] = await query<{ password: string }>(
    `select a.password from account a join "user" u on u.id = a.user_id where u.email = $1 and a.provider_id = 'credential'`,
    [email],
  );
  return row!.password;
}

test("import an Auth0 export with a bcrypt hash, sign in with the old password, and skip an existing address", async ({ adminPage, api, newApi }) => {
  const existing = await createUser(api, "imported-dup");
  const imported = newUser("imported");
  const auth0Id = `auth0|${imported.username}`;
  // Auth0's own format: $2b$, cost 10.
  const bcrypt = hashSync(imported.password, 10);
  const users = [
    { user_id: auth0Id, email: imported.email, email_verified: true, name: imported.name, username: imported.username, created_at: "2023-05-06T07:08:09.000Z" },
    { user_id: "auth0|dup", email: existing.email.toUpperCase(), email_verified: true, name: "Someone Else" },
  ];
  const hashes = [
    { _id: { $oid: imported.username }, email: imported.email, passwordHash: bcrypt },
    { _id: { $oid: "dup" }, email: existing.email, passwordHash: hashSync("not-their-password", 4) },
  ];

  await adminPage.goto("/en/users/import");
  // The form runs in the browser (React): wait until the page has loaded its scripts.
  await adminPage.waitForLoadState("networkidle");
  await adminPage.getByLabel("User file").setInputFiles({
    name: "users.json",
    mimeType: "application/json",
    buffer: Buffer.from(users.map((u) => JSON.stringify(u)).join("\n")),
  });
  await adminPage.getByLabel("Password hash export (optional)").setInputFiles({
    name: "hashes.json",
    mimeType: "application/json",
    buffer: Buffer.from(hashes.map((h) => JSON.stringify(h)).join("\n")),
  });
  await adminPage.getByRole("button", { name: "Run dry run" }).click();

  await expect(adminPage.getByTestId("import-to-create")).toContainText("1");
  await expect(adminPage.getByTestId("import-existing")).toContainText("1");
  await expect(adminPage.getByTestId("import-invalid")).toContainText("0");
  // Nothing written by the dry run.
  expect(await query(`select id from "user" where email = $1`, [imported.email])).toHaveLength(0);

  await adminPage.getByRole("button", { name: "Import 1 user" }).click();
  await expect(adminPage.getByRole("status").filter({ hasText: "1 user imported." }).first()).toBeVisible();

  // The account as the export described it, a plain user in the Public organization.
  const [row] = await query<{ id: string; name: string; role: string; email_verified: boolean; username: string; created_at: Date }>(
    `select id, name, role, email_verified, username, created_at from "user" where email = $1`,
    [imported.email],
  );
  expect(row).toMatchObject({ name: imported.name, role: "user", email_verified: true, username: imported.username });
  expect(row!.created_at.toISOString()).toBe("2023-05-06T07:08:09.000Z");
  expect(await query(`select 1 from member where user_id = $1 and organization_id = $2`, [row!.id, PUBLIC_ORGANIZATION_ID])).toHaveLength(1);
  expect(await storedPassword(imported.email)).toBe(bcrypt);

  // A wrong password changes nothing.
  const client = await newApi();
  expect((await signInWithPassword(client, imported.email, `${imported.password}x`)).status()).toBe(401);
  expect(await storedPassword(imported.email)).toBe(bcrypt);

  // The Auth0 password works, and the stored hash is now Better Auth's scrypt ("salt:key").
  const signIn = await signInWithPassword(client, imported.email, imported.password);
  expect(signIn.status(), await signIn.text()).toBe(200);
  await expectSignedInAs(client, imported.email);
  const rehashed = await storedPassword(imported.email);
  expect(rehashed).not.toBe(bcrypt);
  expect(rehashed).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);

  // And keeps working with the new hash.
  const again = await newApi();
  expect((await signInWithPassword(again, imported.email, imported.password)).status()).toBe(200);

  // The existing account is untouched: its name, and its own password.
  const [kept] = await query<{ name: string }>(`select name from "user" where email = $1`, [existing.email]);
  expect(kept!.name).toBe(existing.name);
  expect((await signInWithPassword(await newApi(), existing.email, existing.password)).status()).toBe(200);

  // One audit entry for the import, with its counts.
  const [audit] = await query<{ metadata: Record<string, unknown> }>(
    `select metadata from audit_log where action = 'user.import' and metadata->>'sha256' is not null order by created_at desc limit 1`,
  );
  expect(audit!.metadata).toMatchObject({ format: "auth0", created: 1, skippedExisting: 1, withPassword: 1, admins: 0 });
});

test("the import route refuses other origins, oversized bodies and non-admins before reading the files", async ({ adminApi, api, playwright, clientIp }) => {
  const multipart = { format: "csv", users: { name: "users.csv", mimeType: "text/csv", buffer: Buffer.from("email\nrefused@e2e.test\n") } };

  // The admin's session, from another origin.
  const crossOrigin = await adminApi.post("/api/admin/users/import?step=preview", { multipart, headers: { origin: "https://evil.e2e.test" } });
  expect(crossOrigin.status()).toBe(403);

  // A body declared larger than the import limit (10 MB of files plus the form) is refused unread.
  const tooLarge = await adminApi.post("/api/admin/users/import?step=preview", {
    multipart: { ...multipart, users: { ...multipart.users, buffer: Buffer.alloc(11 * 1024 * 1024, 0x61) } },
  });
  expect(tooLarge.status()).toBe(413);

  // A JSON body is not an upload.
  expect((await adminApi.post("/api/admin/users/import?step=preview", { data: { format: "csv" } })).status()).toBe(415);

  // A signed-in user who is not an admin.
  await createUser(api, "notimporter");
  const userApi = await playwright.request.newContext({
    baseURL: ADMIN_URL,
    storageState: await api.storageState(),
    extraHTTPHeaders: { origin: ADMIN_URL, "x-forwarded-for": clientIp },
  });
  try {
    expect((await userApi.post("/api/admin/users/import?step=preview", { multipart })).status()).toBe(403);
  } finally {
    await userApi.dispose();
  }

  // The admin, from the console: a dry run, nothing written.
  const preview = await adminApi.post("/api/admin/users/import?step=preview", { multipart });
  expect(preview.status(), await preview.text()).toBe(200);
  expect((await preview.json()).data).toMatchObject({ ok: true, step: "preview", summary: { toCreate: 1 } });
  expect(await query(`select id from "user" where email = 'refused@e2e.test'`)).toHaveLength(0);

  // A confirmation whose digest is not the dry run's imports nothing.
  const wrongDigest = await adminApi.post("/api/admin/users/import?step=confirm", { multipart: { ...multipart, digest: "0".repeat(64) } });
  expect(wrongDigest.status()).toBe(409);
  expect(await query(`select id from "user" where email = 'refused@e2e.test'`)).toHaveLength(0);
});
