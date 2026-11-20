import { ADMIN_EMAIL } from "../support/env";
import { userIdOf } from "../support/db";
import { expect, test } from "../support/fixtures";

/*
 * Every admin console page loads for an admin: a heading, no error boundary and no uncaught
 * error in the browser. The flows themselves are covered by the other specs; this one catches
 * a page that breaks on its own (a query, a missing translation, a render error).
 */
const PUBLIC_ORGANIZATION_ID = "org_public_b2c";

const STATIC_ROUTES = [
  "/",
  "/users",
  "/users/import",
  "/applications",
  "/apis",
  "/api-keys",
  "/consent",
  "/organizations",
  "/sso",
  "/sign-in-providers",
  "/signing-keys",
  "/security",
  "/webhooks",
  "/usage",
  "/audit",
];

async function expectPageLoads(page: import("@playwright/test").Page, path: string) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto(`/en${path === "/" ? "" : path}`);
  expect(response?.status(), path).toBeLessThan(400);
  await expect(page.getByRole("heading", { level: 1 }).first(), path).toBeVisible();
  await expect(page.getByText("Something went wrong"), path).toHaveCount(0);
  expect(errors, path).toEqual([]);
}

for (const path of STATIC_ROUTES) {
  test(`console page ${path} loads`, async ({ adminPage }) => {
    await expectPageLoads(adminPage, path);
  });
}

test("console pages of one user and one organization load", async ({ adminPage }) => {
  await expectPageLoads(adminPage, `/users/${await userIdOf(ADMIN_EMAIL)}`);
  await expectPageLoads(adminPage, `/organizations/${PUBLIC_ORGANIZATION_ID}`);
});
