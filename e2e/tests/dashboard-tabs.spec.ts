import { createUser, loginViaUi } from "../support/auth";
import { expect, test } from "../support/fixtures";

/* The account page: one route per tab, the overview's checklist, and links from before the tabs. */

test("the overview lists what to do, and each tab is its own page", async ({ api, page }) => {
  const user = await createUser(api, "tabs");
  await loginViaUi(page, user.email, user.password);
  await page.waitForURL(/\/dashboard/);

  const checklist = page.getByRole("list", { name: "Security checklist" });
  await expect(checklist.getByText("Turn on two-factor authentication")).toBeVisible();
  await expect(checklist.getByText("Add a passkey to sign in without a password")).toBeVisible();

  await page.getByRole("navigation").getByRole("link", { name: "Security" }).click();
  await page.waitForURL(/\/en\/dashboard\/security$/);
  await expect(page.getByRole("link", { name: "Security" })).toHaveAttribute("aria-current", "page");

  // The password form opens on demand.
  await expect(page.getByLabel("Current password")).toHaveCount(0);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByLabel("Current password")).toBeFocused();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("Current password")).toHaveCount(0);
});

test("a link to a section of the old one-page dashboard opens its tab", async ({ api, page }) => {
  const user = await createUser(api, "tabs-legacy");
  await loginViaUi(page, user.email, user.password);
  await page.waitForURL(/\/dashboard/);
  await page.goto("/en/dashboard/profile");
  await page.goto("/en/dashboard#data");
  await page.waitForURL(/\/en\/dashboard\/data$/);
  await page.goto("/en/dashboard?continue=%2Fen#two-factor");
  await page.waitForURL(/\/en\/dashboard\/security\?continue=%2Fen#two-factor$/);
});
