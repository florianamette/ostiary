import { randomInt } from "node:crypto";

import type { APIRequestContext } from "@playwright/test";

import { createUser, newUser } from "../support/auth";
import { query } from "../support/db";
import { expect, test } from "../support/fixtures";

/*
 * The email domain policy (admin console, Security; lib/email-domain-policy.ts). It decides who
 * may sign up, so it runs in the platform-settings project, after every other test, and puts the
 * default (anyone) back.
 */

/** A password sign-up from its own client address, so the sign-up rate limit never applies. */
async function signUpStatus(api: APIRequestContext, email: string) {
  const user = newUser("domains", email);
  const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
  const response = await api.post("/api/auth/sign-up/email", {
    data: { email, password: user.password, name: user.name, username: user.username },
    headers: { "x-forwarded-for": ip },
  });
  const body = (await response.json().catch(() => ({}))) as { code?: string };
  return response.status() === 200 ? "created" : body.code ?? String(response.status());
}

// Three changes, each reaching the auth app within a minute (its settings cache).
test.setTimeout(300_000);

test("the email domain policy decides which addresses can create an account", async ({ adminPage, adminApi, api, newApi, page }) => {
  const id = Date.now();
  try {
    // A test before this one may have turned password sign-up off: wait until the auth app has
    // its defaults again.
    const anonymous = await newApi();
    await expect
      .poll(() => signUpStatus(anonymous, `ready-${Date.now()}@e2e.test`), { timeout: 100_000, intervals: [3_000, 5_000] })
      .toBe("created");
    const existing = await createUser(api, "domains");

    // Blocked domains, and throwaway services, from the console.
    await adminPage.goto("/en/security");
    await adminPage.locator('[data-slot="card"]').filter({ hasText: "Email domains" }).getByRole("button", { name: "Edit" }).click();
    const dialog = adminPage.getByRole("dialog");
    await dialog.getByRole("radio", { name: "Any address except these domains" }).check();
    await dialog.getByRole("textbox", { name: "Blocked domains" }).fill("@Blocked-e2e.test\nnot a domain");
    await dialog.getByRole("checkbox", { name: "Block throwaway email addresses" }).check();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(adminPage.getByText("One of the entries isn't a domain name")).toBeVisible();
    await dialog.getByRole("textbox", { name: "Blocked domains" }).fill("@Blocked-e2e.test");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(adminPage.getByText("Email domains saved.")).toBeVisible();
    await expect(adminPage.getByText("blocked-e2e.test", { exact: true })).toBeVisible();

    // The auth app picks it up within a minute.
    await expect
      .poll(() => signUpStatus(anonymous, `a-${Date.now()}@blocked-e2e.test`), { timeout: 100_000, intervals: [3_000, 5_000] })
      .toBe("EMAIL_DOMAIN_NOT_ALLOWED");
    expect(await signUpStatus(anonymous, `b-${id}@eu.blocked-e2e.test`)).toBe("EMAIL_DOMAIN_NOT_ALLOWED");
    expect(await signUpStatus(anonymous, `c-${id}@mailinator.com`)).toBe("EMAIL_DOMAIN_NOT_ALLOWED");
    expect(await signUpStatus(anonymous, `d-${id}@e2e.test`)).toBe("created");

    // The sign-up page says why.
    await page.goto("/en/signup");
    const person = newUser("domains", `e-${id}@blocked-e2e.test`);
    await page.getByRole("textbox", { name: "Full Name" }).fill(person.name);
    await page.getByRole("textbox", { name: "Username" }).fill(person.username);
    await page.getByRole("textbox", { name: "Email" }).fill(person.email);
    await page.getByRole("textbox", { name: "Password", exact: true }).fill(person.password);
    await page.getByRole("textbox", { name: "Confirm Password" }).fill(person.password);
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page.getByText("Accounts with this email domain can't be created here.")).toBeVisible();

    // An existing account keeps signing in, but cannot move to a blocked address.
    const moved = await api.post("/api/auth/change-email", { data: { newEmail: `f-${id}@blocked-e2e.test` } });
    expect(moved.status()).toBe(400);
    expect(((await moved.json()) as { code?: string }).code).toBe("EMAIL_DOMAIN_NOT_ALLOWED");

    // Only listed domains (written directly: the console path is covered above).
    await query(
      `insert into app_setting (key, value, updated_at) values ('email_domain_policy', $1, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [JSON.stringify({ mode: "allow", domains: ["allowed-e2e.test"], blockDisposable: false })],
    );
    await expect
      .poll(() => signUpStatus(anonymous, `g-${Date.now()}@e2e.test`), { timeout: 100_000, intervals: [3_000, 5_000] })
      .toBe("EMAIL_DOMAIN_NOT_ALLOWED");
    expect(await signUpStatus(anonymous, `h-${id}@team.allowed-e2e.test`)).toBe("created");

    // An admin can still create an account with any address.
    const created = await adminApi.post("/api/auth/admin/create-user", {
      data: { email: `i-${id}@elsewhere-e2e.test`, password: newUser().password, name: "Created by an admin" },
    });
    expect(created.status(), await created.text()).toBe(200);
    expect(existing.email).toMatch(/@e2e\.test$/);
  } finally {
    // Back to the default; nothing runs after this project.
    await query(`delete from app_setting where key = 'email_domain_policy'`);
  }
});
