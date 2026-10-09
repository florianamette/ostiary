import { writeFileSync } from "node:fs";
import path from "node:path";

import { createUser, enableTotp, getSession, signInWithTotp } from "../support/auth";
import { query } from "../support/db";
import { ADMIN_EMAIL } from "../support/env";
import { ADMIN_STATE, expect, test } from "../support/fixtures";
import { E2E_DIR } from "../support/load-env.mjs";

/**
 * Creates the admin every admin-console test signs in as: signs up with an ADMIN_EMAILS
 * address, verifies the email, turns on two-factor authentication (REQUIRE_ADMIN_2FA) and
 * signs in again with a TOTP code. The session is saved for the other tests (ADMIN_STATE).
 */
test("bootstrap the admin account", async ({ api, newApi }) => {
  // Re-runnable on the same database: forget the admin of a previous run.
  await query(`delete from "user" where email = $1`, [ADMIN_EMAIL]);

  const admin = await createUser(api, "admin", ADMIN_EMAIL);
  expect((await getSession(api))?.user.role).toBe("admin");
  const secret = await enableTotp(api, admin.password);

  const signedIn = await newApi();
  await signInWithTotp(signedIn, admin.email, admin.password, secret);
  const session = await getSession(signedIn);
  expect(session?.user).toMatchObject({ role: "admin", twoFactorEnabled: true });
  await signedIn.storageState({ path: ADMIN_STATE });
  writeFileSync(path.join(E2E_DIR, ".data", "admin.json"), JSON.stringify({ ...admin, secret }));
});
