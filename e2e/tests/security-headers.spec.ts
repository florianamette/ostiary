import type { Page } from "@playwright/test";

import { createUser, loginViaUi } from "../support/auth";
import { ADMIN_URL, AUTH_URL } from "../support/env";
import { expect, test } from "../support/fixtures";
import { authorizeUrl, createClient, pkce } from "../support/oauth";

/*
 * Nonce-based Content Security Policy (packages/core/src/lib/csp.ts): every page still hydrates
 * with no CSP violation, each response has its own nonce, and production allows neither eval
 * nor inline scripts without the nonce. Also the signed-in redirect of /login (callbackURL).
 */

/** Records CSP violations (event and console) on a page. */
function watchCsp(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (/content security policy|refused to (execute|load|evaluate|apply)/i.test(text)) violations.push(text);
  });
  page.on("pageerror", (error) => {
    if (/content security policy|eval/i.test(error.message)) violations.push(error.message);
  });
  void page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.error(`Content Security Policy violation: ${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  return violations;
}

/** True once React has hydrated the page (it tags the DOM nodes it owns). */
async function expectHydrated(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const nodes = [document.body, ...Array.from(document.body.querySelectorAll("*")).slice(0, 200)];
        return nodes.some((node) => Object.keys(node).some((key) => key.startsWith("__reactFiber")));
      }),
    )
    .toBe(true);
}

function scriptSrc(csp: string | undefined): string[] {
  return (csp ?? "").split("; ").find((d) => d.startsWith("script-src "))?.split(" ").slice(1) ?? [];
}

test("pages carry a fresh nonce policy, without eval, and no x-powered-by", async ({ api, playwright }) => {
  const first = await api.get("/en/signup");
  const second = await api.get("/en/signup");
  expect(first.status()).toBe(200);
  const csp = first.headers()["content-security-policy"];
  const script = scriptSrc(csp);
  expect(script).toContain("'strict-dynamic'");
  expect(script).not.toContain("'unsafe-eval'");
  expect(script).not.toContain("'unsafe-inline'");
  const nonce = script.find((s) => s.startsWith("'nonce-"))!;
  expect(nonce).toBeTruthy();
  expect(scriptSrc(second.headers()["content-security-policy"])).not.toContain(nonce);
  // Next.js put the nonce on its scripts; no script runs without it.
  const html = await first.text();
  const value = nonce.slice("'nonce-".length, -1);
  expect(html).toContain(`nonce="${value}"`);
  for (const tag of html.match(/<script\b[^>]*>/g) ?? []) expect(tag).toContain(`nonce="${value}"`);
  expect(first.headers()["x-powered-by"]).toBeUndefined();
  // Only one policy per response (next.config's fixed one is replaced on pages).
  expect(first.headersArray().filter((h) => h.name.toLowerCase() === "content-security-policy")).toHaveLength(1);
  // Google One Tap's sources on sign-in and sign-up only.
  expect(csp).toContain("https://accounts.google.com/gsi/");
  expect((await api.get("/en/forgot-password")).headers()["content-security-policy"]).not.toContain("accounts.google.com");

  // The admin app too.
  const admin = await playwright.request.newContext({ baseURL: ADMIN_URL });
  const icon = await admin.get("/icon");
  expect(icon.headers()["x-powered-by"]).toBeUndefined();
  expect(scriptSrc(icon.headers()["content-security-policy"])).toEqual(["'self'"]);
  await admin.dispose();
});

test("sign-up, sign-in, consent and the dashboard hydrate under the CSP", async ({ api, adminApi, page }) => {
  const violations = watchCsp(page);

  await page.goto("/en/signup");
  await expectHydrated(page);

  const user = await createUser(api, "csp");
  const client = await createClient(adminApi, { scope: "openid profile email" });
  await page.goto(authorizeUrl(client, { scope: "openid profile email", challenge: pkce().challenge, state: "csp" }));
  await page.waitForURL(/\/login/);
  await expectHydrated(page);
  // The login form submits through client-side JavaScript: it only works once hydrated.
  await loginViaUi(page, user.email, user.password, false);
  await page.waitForURL(/\/consent/);
  await expectHydrated(page);
  await expect(page.getByRole("button", { name: "Allow" })).toBeVisible();

  await page.goto("/en/dashboard");
  await expectHydrated(page);
  await expect(page.getByRole("heading").first()).toBeVisible();

  expect(violations).toEqual([]);
});

test("the admin console hydrates under the CSP", async ({ adminPage }) => {
  const violations = watchCsp(adminPage);
  for (const path of ["/en", "/en/users", "/en/applications"]) {
    const response = await adminPage.goto(path);
    expect(response?.status()).toBe(200);
    expect(scriptSrc(response?.headers()["content-security-policy"])).toContain("'strict-dynamic'");
    await expectHydrated(adminPage);
  }
  expect(violations).toEqual([]);
});

test("a signed-in visit to /login follows only same-origin or trusted callbackURLs", async ({ api }) => {
  await createUser(api, "redirect");
  const destination = async (callbackURL: string) => {
    const response = await api.get(`/en/login?callbackURL=${encodeURIComponent(callbackURL)}`, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    return new URL(response.headers().location!, AUTH_URL).href;
  };
  for (const evil of ["/\\evil.example", "/\t/evil.example", "//evil.example", "https://evil.example/", "/\\/evil.example/en"]) {
    expect(await destination(evil), evil).toBe(`${AUTH_URL}/en/dashboard`);
  }
  expect(await destination("/en/dashboard#security")).toBe(`${AUTH_URL}/en/dashboard#security`);
  expect(await destination(`${ADMIN_URL}/en/users`)).toBe(`${ADMIN_URL}/en/users`);
});
