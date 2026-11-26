import { createUser, loginViaUi } from "../support/auth";
import { expect, test } from "../support/fixtures";
import { authorizeUrl, createClient, interceptCallback, pkce } from "../support/oauth";

/*
 * A passkey sign-in on the login page an app sent the person to resumes that app's
 * authorization request, as a password sign-in does (#110), instead of opening the dashboard.
 * Chromium's virtual authenticator stands in for the device.
 */
test("a passkey sign-in during an app's sign-in goes on to the app", async ({ adminApi, api, page }) => {
  const user = await createUser(api, "passkey-app");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });

  await loginViaUi(page, user.email, user.password);
  await page.waitForURL(/\/en(\/dashboard)?$/);
  await page.goto("/en/dashboard");
  await page.getByRole("button", { name: "Add passkey (this device)" }).click();
  await expect(page.getByText("Passkey added")).toBeVisible();

  // Signed out; the passkey stays on the (virtual) device.
  await page.context().clearCookies();
  const client = await createClient(adminApi, { scope: "openid email" });
  const callback = await interceptCallback(page);
  await page.goto(authorizeUrl(client, { scope: "openid email", challenge: pkce().challenge }));
  await page.waitForURL(/\/login/);
  await page.getByRole("button", { name: "Sign in with passkey" }).click();
  // Polled rather than waitForURL: Better Auth's own redirect and the form's may both start,
  // and the one that is cut short aborts a waitForURL.
  await expect(page).toHaveURL(/\/consent/, { timeout: 15_000 });
  await page.getByRole("button", { name: "Allow" }).click();
  expect((await callback()).searchParams.get("code")).toBeTruthy();
});
