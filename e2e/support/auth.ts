import { randomBytes } from "node:crypto";

import { expect, type APIRequestContext } from "@playwright/test";

import { waitForEmail } from "./mail";
import { freshTotp, secretFromUri } from "./totp";

export type TestUser = { email: string; password: string; name: string; username: string };

/** A new, unique user (not created yet). */
export function newUser(prefix = "user", email?: string): TestUser {
  const id = randomBytes(5).toString("hex");
  return {
    email: email ?? `${prefix}-${id}@e2e.test`,
    // Long and random: Better Auth's minimum length, never in a breach corpus.
    password: `E2e-${randomBytes(12).toString("base64url")}`,
    name: `${prefix} ${id}`,
    username: `${prefix.replace(/[^a-z0-9]/gi, "").slice(0, 10)}_${id}`.toLowerCase(),
  };
}

export async function signUp(api: APIRequestContext, user: TestUser) {
  const response = await api.post("/api/auth/sign-up/email", {
    data: { email: user.email, password: user.password, name: user.name, username: user.username },
  });
  expect(response.status(), await response.text()).toBe(200);
}

/** Opens the link of the latest verification email (signs the request context in). */
export async function verifyEmail(api: APIRequestContext, email: string, since: number) {
  const mail = await waitForEmail(email, "verification", since);
  expect(mail.url).toContain("/api/auth/verify-email?token=");
  const response = await api.get(mail.url!, { maxRedirects: 0 });
  expect(response.status()).toBe(302);
}

/** Signs up and verifies a new user; `api` is then signed in as them. */
export async function createUser(api: APIRequestContext, prefix = "user", email?: string): Promise<TestUser> {
  const user = newUser(prefix, email);
  const since = Date.now() - 1000;
  await signUp(api, user);
  await verifyEmail(api, user.email, since);
  await expectSignedInAs(api, user.email);
  return user;
}

export async function getSession(api: APIRequestContext) {
  const response = await api.get("/api/auth/get-session");
  expect(response.ok()).toBe(true);
  return (await response.json()) as { user: { id: string; email: string; role?: string; twoFactorEnabled?: boolean } } | null;
}

export async function expectSignedInAs(api: APIRequestContext, email: string) {
  const session = await getSession(api);
  expect(session?.user.email).toBe(email);
  return session!;
}

export async function signInWithPassword(api: APIRequestContext, email: string, password: string) {
  return api.post("/api/auth/sign-in/email", { data: { email, password } });
}

/** Turns on authenticator-app two-factor authentication; returns the TOTP secret. */
export async function enableTotp(api: APIRequestContext, password: string): Promise<string> {
  const enable = await api.post("/api/auth/two-factor/enable", { data: { password } });
  expect(enable.status(), await enable.text()).toBe(200);
  const { totpURI } = (await enable.json()) as { totpURI: string };
  const secret = secretFromUri(totpURI);
  const verify = await api.post("/api/auth/two-factor/verify-totp", { data: { code: await freshTotp(secret) } });
  expect(verify.status(), await verify.text()).toBe(200);
  return secret;
}

/** Password sign-in followed by the TOTP step. */
export async function signInWithTotp(api: APIRequestContext, email: string, password: string, secret: string) {
  const first = await signInWithPassword(api, email, password);
  expect(first.status(), await first.text()).toBe(200);
  expect(await first.json()).toMatchObject({ twoFactorRedirect: true });
  const second = await api.post("/api/auth/two-factor/verify-totp", { data: { code: await freshTotp(secret) } });
  expect(second.status(), await second.text()).toBe(200);
  await expectSignedInAs(api, email);
}
