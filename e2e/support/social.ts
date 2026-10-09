import { createCipheriv, createHmac, randomBytes } from "node:crypto";

import { expect, type APIRequestContext, type Page } from "@playwright/test";

import { query } from "./db";
import { BETTER_AUTH_SECRET } from "./env";

/** Same format as packages/core/src/lib/secret-box.ts: v1.<iv>.<tag>.<ciphertext>, AES-256-GCM. */
function sealSecret(plaintext: string, secret: string, purpose: string): string {
  const key = createHmac("sha256", secret).update(`ostiary:secret-box:${purpose}`).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

/** POST /sign-in/social without following the redirect: the provider's authorization URL, or the error. */
export async function startSocialSignIn(api: APIRequestContext, provider: string, callbackURL = "/en/dashboard") {
  const response = await api.post("/api/auth/sign-in/social", {
    data: { provider, callbackURL, disableRedirect: true },
  });
  return { status: response.status(), body: (await response.json().catch(() => ({}))) as { url?: string; code?: string; message?: string } };
}

/** Waits for the auth app to pick up a provider change (it reloads them every 30 seconds). */
export async function waitForSocialProvider(api: APIRequestContext, provider: string, enabled: boolean) {
  await expect
    .poll(async () => (await startSocialSignIn(api, provider)).status === 200, {
      message: `${provider} ${enabled ? "enabled" : "disabled"} on the auth app`,
      timeout: 45_000,
      intervals: [1_000, 2_000],
    })
    .toBe(enabled);
}

/** Admin console, Sign-in providers: opens a provider's settings dialog. */
export async function openProvider(page: Page, name: string) {
  await page.goto("/en/sign-in-providers");
  // "Edit GitHub" once it is on the sign-in page, else its entry in the list of every provider.
  const edit = page.getByRole("button", { name: `Edit ${name}`, exact: true });
  const entry = page.getByRole("textbox", { name: "Search providers" });
  await expect(edit.or(entry).first()).toBeVisible();
  if (await edit.isVisible()) {
    await edit.click();
  } else {
    await entry.fill(name);
    await page.getByRole("listitem").getByRole("button", { name: new RegExp(`^${name}`) }).first().click();
  }
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * Stores a provider row the way the admin console does (secrets sealed with BETTER_AUTH_SECRET).
 * For the GitLab mock, whose http://127.0.0.1 URL the console refuses (it requires https).
 */
export async function upsertProviderRow(id: string, config: Record<string, string>, secrets: Record<string, string>, enabled = true) {
  const sealed = sealSecret(JSON.stringify(secrets), BETTER_AUTH_SECRET, "social-provider");
  await query(
    `insert into social_provider (id, enabled, position, config, secrets, allow_sign_up, updated_at)
     values ($1, $2, 100, $3, $4, true, now())
     on conflict (id) do update set enabled = $2, config = $3, secrets = $4, allow_sign_up = true, updated_at = now()`,
    [id, enabled, JSON.stringify(config), sealed],
  );
}
