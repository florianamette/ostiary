import type { Page } from "@playwright/test";

import { createUser, loginViaUi } from "../support/auth";
import { expect, test } from "../support/fixtures";
import { authorizeUrl, createClient, interceptCallback, pkce, type Client } from "../support/oauth";

/*
 * A passkey sign-in on the login page an app sent the person to resumes that app's
 * authorization request, as a password sign-in does (#110), instead of opening the dashboard.
 * Chromium's virtual authenticator stands in for the device. It also answers the login page's
 * passkey autofill request by itself, which a person does only by picking the passkey: so the
 * button is tested with autofill unavailable, and autofill on its own.
 */

/** Signs up, registers a passkey on the virtual authenticator, signs out, and starts an app's sign-in. */
async function passkeyAccountAtAppSignIn(page: Page, api: Parameters<typeof createUser>[0], client: Client) {
  const user = await createUser(api, "passkey-app");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  await loginViaUi(page, user.email, user.password);
  await page.waitForURL(/\/en(\/dashboard)?$/);
  await page.goto("/en/dashboard/security");
  await page.getByRole("button", { name: "Add passkey (this device)" }).click();
  await expect(page.getByText("Passkey added")).toBeVisible();

  // Signed out; the passkey stays on the (virtual) device.
  await page.context().clearCookies();
  const callback = await interceptCallback(page);
  await page.goto(authorizeUrl(client, { scope: "openid email", challenge: pkce().challenge }));
  await page.waitForURL(/\/login/);
  return callback;
}

async function expectAppResumes(page: Page, callback: () => Promise<URL>) {
  // Polled rather than waitForURL: Better Auth's own redirect and the form's may both start,
  // and the one that is cut short aborts a waitForURL.
  await expect(page).toHaveURL(/\/consent/, { timeout: 15_000 });
  await page.getByRole("button", { name: "Allow" }).click();
  expect((await callback()).searchParams.get("code")).toBeTruthy();
}

test("the passkey button during an app's sign-in goes on to the app", async ({ adminApi, api, page }) => {
  // No autofill request: the button's is the only one.
  await page.addInitScript(() => {
    if (window.PublicKeyCredential) window.PublicKeyCredential.isConditionalMediationAvailable = async () => false;
  });
  const client = await createClient(adminApi, { scope: "openid email" });
  const callback = await passkeyAccountAtAppSignIn(page, api, client);
  await page.getByRole("button", { name: "Sign in with passkey" }).click();
  await expectAppResumes(page, callback);
});

test("passkey autofill during an app's sign-in goes on to the app", async ({ adminApi, api, page }) => {
  // The virtual authenticator answers the autofill request as soon as the login page makes it.
  const client = await createClient(adminApi, { scope: "openid email" });
  const callback = await passkeyAccountAtAppSignIn(page, api, client);
  await expectAppResumes(page, callback);
});
