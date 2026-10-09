import { randomBytes } from "node:crypto";

import type { APIRequestContext, Page } from "@playwright/test";

import { createUser, getSession, loginViaUi, newUser, signUp, verifyEmail, type TestUser } from "../support/auth";
import { query } from "../support/db";
import { ADMIN_URL, AUTH_URL, env } from "../support/env";
import { ADMIN_STATE, expect, test } from "../support/fixtures";
import { waitForEmail } from "../support/mail";
import { authorizeUrl, createClient, interceptCallback, pkce, tokenRequest, type Client, type TokenResponse } from "../support/oauth";

/* Account, session and SSO hardening: admin promotion, token revocation, the Public organization, SSO endpoints, roles, impersonation. */

/** The fourth ADMIN_EMAILS address (.env.test), only used here. */
const PENDING_ADMIN_EMAIL = (env.ADMIN_EMAILS ?? "").split(",")[3]?.trim() ?? "";

async function roleOf(email: string) {
  const [row] = await query<{ role: string | null }>(`select role from "user" where email = $1`, [email]);
  return row?.role ?? null;
}

async function userId(email: string) {
  const [row] = await query<{ id: string }>(`select id from "user" where email = $1`, [email]);
  return row!.id;
}

/** Signs in through an app's authorization request and returns its tokens (with a refresh token). */
async function appTokens(page: Page, api: APIRequestContext, adminApi: APIRequestContext, user: TestUser) {
  const scope = "openid email offline_access";
  const client: Client = await createClient(adminApi, { scope });
  const { verifier, challenge } = pkce();
  const callback = await interceptCallback(page);
  await page.goto(authorizeUrl(client, { scope, challenge }));
  await page.waitForURL(/\/login/);
  await loginViaUi(page, user.email, user.password, false);
  await page.waitForURL(/\/consent/);
  await page.getByRole("button", { name: "Allow" }).click();
  const code = (await callback()).searchParams.get("code")!;
  const exchanged = await tokenRequest(api, client, { grant_type: "authorization_code", code, redirect_uri: "https://app.e2e.test/callback", code_verifier: verifier });
  expect(exchanged.status(), await exchanged.text()).toBe(200);
  const tokens = (await exchanged.json()) as TokenResponse;
  expect(tokens.refresh_token).toBeTruthy();
  return { client, tokens };
}

test("ADMIN_EMAILS: a password sign-up becomes admin only once the address is verified", async ({ api }) => {
  expect(PENDING_ADMIN_EMAIL, "a fourth address in ADMIN_EMAILS").toBeTruthy();
  await query(`delete from "user" where email = $1`, [PENDING_ADMIN_EMAIL]);
  const user = newUser("pending", PENDING_ADMIN_EMAIL);
  const since = Date.now() - 1000;
  await signUp(api, user);
  expect(await roleOf(PENDING_ADMIN_EMAIL)).toBe("user");

  await verifyEmail(api, user.email, since);
  expect(await roleOf(PENDING_ADMIN_EMAIL)).toBe("admin");
  expect((await getSession(api))?.user.role).toBe("admin");
  await query(`delete from "user" where email = $1`, [PENDING_ADMIN_EMAIL]);
});

test("banning an account revokes the apps' refresh tokens", async ({ api, adminApi, page }) => {
  const user = await createUser(api, "banned");
  const { client, tokens } = await appTokens(page, api, adminApi, user);

  const ban = await adminApi.post("/api/auth/admin/ban-user", { data: { userId: await userId(user.email), banReason: "e2e" } });
  expect(ban.status(), await ban.text()).toBe(200);

  const refreshed = await tokenRequest(api, client, { grant_type: "refresh_token", refresh_token: tokens.refresh_token! });
  expect(refreshed.status()).toBeGreaterThanOrEqual(400);
  const [row] = await query<{ live: string }>(`select count(*)::text as live from oauth_refresh_token where user_id = $1 and revoked is null`, [await userId(user.email)]);
  expect(row!.live).toBe("0");
});

test("resetting the password revokes the apps' refresh tokens", async ({ api, adminApi, page, newApi }) => {
  const user = await createUser(api, "reset");
  const { client, tokens } = await appTokens(page, api, adminApi, user);

  const since = Date.now() - 1000;
  const anonymous = await newApi();
  const requested = await anonymous.post("/api/auth/request-password-reset", { data: { email: user.email, redirectTo: "/en/reset-password" } });
  expect(requested.status(), await requested.text()).toBe(200);
  const mail = await waitForEmail(user.email, "password reset", since);
  const token = new URL(mail.url!).pathname.split("/").at(-1)!;
  const reset = await anonymous.post("/api/auth/reset-password", { data: { token, newPassword: `E2e-${randomBytes(12).toString("base64url")}` } });
  expect(reset.status(), await reset.text()).toBe(200);

  const refreshed = await tokenRequest(api, client, { grant_type: "refresh_token", refresh_token: tokens.refresh_token! });
  expect(refreshed.status()).toBeGreaterThanOrEqual(400);
});

test("the Public organization's members and invitations are not listed to its members", async ({ api, adminApi }) => {
  await createUser(api, "public");
  for (const path of ["/organization/list-members", "/organization/get-full-organization", "/organization/list-invitations"]) {
    const response = await api.get(`/api/auth${path}`);
    expect(response.status(), path).toBe(403);
    expect(await response.json()).toMatchObject({ code: "PUBLIC_ORGANIZATION_RESTRICTED" });
  }
  const explicit = await api.get("/api/auth/organization/list-members?organizationId=org_public_b2c");
  expect(explicit.status()).toBe(403);
  // Their own organizations and role still work.
  expect((await api.get("/api/auth/organization/list")).status()).toBe(200);
  expect((await api.get("/api/auth/organization/get-active-member-role")).status()).toBe(200);
  // Platform admins manage it from the console.
  const admin = await adminApi.get("/api/auth/organization/list-members?organizationId=org_public_b2c&limit=1");
  expect(admin.status(), await admin.text()).toBe(200);
});

test("SSO providers are managed from the console only, with a plain email domain", async ({ api, adminApi }) => {
  await createUser(api, "sso");
  for (const path of ["/sso/providers", "/sso/get-provider?providerId=x"]) {
    expect((await api.get(`/api/auth${path}`)).status(), path).toBe(404);
    expect((await adminApi.get(`/api/auth${path}`)).status(), `admin ${path}`).toBe(404);
  }
  for (const path of ["/sso/update-provider", "/sso/delete-provider", "/sso/request-domain-verification", "/sso/verify-domain"]) {
    expect((await api.post(`/api/auth${path}`, { data: { providerId: "x" } })).status(), path).toBe(404);
  }

  for (const domain of ["attacker.e2e.test\\@victim.e2e.test", "victim.e2e.test/x", "a.e2e.test,b.e2e.test", "https://victim.e2e.test"]) {
    const response = await adminApi.post("/api/auth/sso/register", {
      data: {
        providerId: `e2e-${randomBytes(3).toString("hex")}`,
        issuer: "https://idp.e2e.test",
        domain,
        oidcConfig: { clientId: "x", clientSecret: "y", skipDiscovery: true },
      },
    });
    expect(response.status(), domain).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_SSO_DOMAIN" });
  }
});

test("roles are limited to admin and user", async ({ api, adminApi }) => {
  const user = await createUser(api, "role");
  const id = await userId(user.email);
  const refused = await adminApi.post("/api/auth/admin/set-role", { data: { userId: id, role: "user, admin" } });
  expect(refused.status()).toBe(400);
  expect(await roleOf(user.email)).toBe("user");
});

test("an impersonating admin cannot add a passkey or connect a provider to the account", async ({ api, playwright, clientIp }) => {
  const user = await createUser(api, "viewed");
  const admin = await playwright.request.newContext({
    baseURL: ADMIN_URL,
    storageState: ADMIN_STATE,
    extraHTTPHeaders: { origin: ADMIN_URL, "x-forwarded-for": clientIp },
  });
  try {
    const impersonated = await admin.post("/api/auth/admin/impersonate-user", { data: { userId: await userId(user.email) } });
    expect(impersonated.status(), await impersonated.text()).toBe(200);
    const asUser = { origin: AUTH_URL };
    const session = await admin.get(`${AUTH_URL}/api/auth/get-session`, { headers: asUser });
    expect((await session.json()).user.email).toBe(user.email);

    const passkey = await admin.get(`${AUTH_URL}/api/auth/passkey/generate-register-options`, { headers: asUser });
    expect(passkey.status()).toBe(403);
    expect(await passkey.json()).toMatchObject({ code: "IMPERSONATING" });
    const link = await admin.post(`${AUTH_URL}/api/auth/link-social`, { headers: asUser, data: { provider: "github", callbackURL: "/en/dashboard" } });
    expect(link.status()).toBe(403);
    expect(await link.json()).toMatchObject({ code: "IMPERSONATING" });
  } finally {
    await admin.dispose();
  }
});
