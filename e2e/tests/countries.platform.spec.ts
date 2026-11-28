import { randomInt } from "node:crypto";

import type { APIRequestContext } from "@playwright/test";

import { createUser, newUser, type TestUser } from "../support/auth";
import { query } from "../support/db";
import { expect, test } from "../support/fixtures";

/*
 * The country policy (admin console, Security; lib/country-policy.ts), with the country from
 * COUNTRY_HEADER (x-e2e-country, see .env.test). It decides who may sign in, so it runs in the
 * platform-settings project, after every other test, and puts the default (any country) back.
 */

const ip = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

async function signUpStatus(api: APIRequestContext, country: string) {
  const user = newUser("countries");
  const response = await api.post("/api/auth/sign-up/email", {
    data: { email: user.email, password: user.password, name: user.name, username: user.username },
    headers: { "x-forwarded-for": ip(), "x-e2e-country": country },
  });
  const body = (await response.json().catch(() => ({}))) as { code?: string };
  return response.status() === 200 ? "created" : body.code ?? String(response.status());
}

async function signInStatus(api: APIRequestContext, user: TestUser, country: string) {
  const response = await api.post("/api/auth/sign-in/email", {
    data: { email: user.email, password: user.password },
    headers: { "x-forwarded-for": ip(), "x-e2e-country": country },
  });
  const body = (await response.json().catch(() => ({}))) as { code?: string };
  return response.status() === 200 ? "signed in" : body.code ?? String(response.status());
}

// Two changes, each reaching the auth app within a minute (its settings cache).
test.setTimeout(300_000);

test("the country policy decides where people can sign in and sign up from", async ({ adminPage, api, newApi, page }) => {
  try {
    // A test before this one may have changed sign-up settings: wait for the defaults.
    const anonymous = await newApi();
    await expect.poll(() => signUpStatus(anonymous, "FR"), { timeout: 100_000, intervals: [3_000, 5_000] }).toBe("created");
    const user = await createUser(api, "countries");

    await adminPage.goto("/en/security");
    const card = adminPage.locator('[data-slot="card"]').filter({ hasText: "Countries" });
    await card.getByRole("button", { name: "Edit" }).click();
    const dialog = adminPage.getByRole("dialog");
    await dialog.getByRole("radio", { name: "Any country except these" }).check();
    await dialog.getByRole("textbox", { name: "Blocked countries" }).fill("FR, France");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(adminPage.getByText("One of the entries isn't a two-letter country code")).toBeVisible();
    await dialog.getByRole("textbox", { name: "Blocked countries" }).fill("fr");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(adminPage.getByText("Countries saved.")).toBeVisible();
    await expect(card.getByText("France (FR)")).toBeVisible();

    // The auth app picks it up within a minute.
    await expect.poll(() => signInStatus(anonymous, user, "FR"), { timeout: 100_000, intervals: [3_000, 5_000] }).toBe("COUNTRY_NOT_ALLOWED");
    expect(await signInStatus(anonymous, user, "DE")).toBe("signed in");
    expect(await signUpStatus(anonymous, "FR")).toBe("COUNTRY_NOT_ALLOWED");
    expect(await signUpStatus(anonymous, "DE")).toBe("created");
    // An unknown country is allowed.
    expect(await signInStatus(anonymous, user, "XX")).toBe("signed in");
    // (A platform admin is never refused: country-policy.test.ts.)

    // The sign-in page says why.
    await page.setExtraHTTPHeaders({ "x-forwarded-for": ip(), "x-e2e-country": "FR" });
    await page.goto("/en/login");
    await page.getByRole("textbox", { name: "Email or username" }).fill(user.email);
    await page.getByRole("textbox", { name: "Password" }).fill(user.password);
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await expect(page.getByText("Signing in from your country is not allowed here.")).toBeVisible();

    const refused = await query(`select 1 from audit_log where action = 'security.country_refused' and metadata->>'country' = 'FR'`);
    expect(refused.length).toBeGreaterThan(0);
  } finally {
    await query(`delete from app_setting where key = 'country_policy'`);
  }
});
