import { randomBytes } from "node:crypto";

import { expect, type Page } from "@playwright/test";

export type TestApi = { identifier: string; name: string; scopes: string[] };

/** A unique API (not registered yet) with two scopes. */
export function newApi(prefix = "api"): TestApi {
  const id = randomBytes(4).toString("hex");
  return {
    identifier: `https://${prefix}-${id}.e2e.test`,
    name: `${prefix} ${id}`,
    scopes: [`${prefix}${id}:read`, `${prefix}${id}:write`],
  };
}

/** Registers an API from the admin console's APIs page. */
export async function registerApi(page: Page, api: TestApi) {
  await page.goto("/en/apis");
  await page.getByRole("textbox", { name: "Identifier" }).fill(api.identifier);
  await page.getByRole("textbox", { name: "Name" }).fill(api.name);
  await page.getByRole("textbox", { name: "Scopes" }).fill(api.scopes.join(" "));
  await page.getByRole("button", { name: "Register API" }).click();
  await expect(page.getByText("API registered")).toBeVisible();
  // The list refreshes in the background (router.refresh); a reload does not depend on its timing.
  await page.reload();
  await expect(page.getByRole("button", { name: `Edit ${api.name}` })).toBeVisible();
}

/** APIs page, "Change" next to Applications: limits the API to these linked applications. */
export async function limitApiToLinked(page: Page, api: TestApi, clientIds: string[]) {
  await page.goto("/en/apis");
  await page.getByRole("button", { name: `Change which applications can use ${api.name}` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "Only linked applications" }).check();
  const filter = dialog.getByRole("searchbox", { name: "Filter applications" });
  for (const clientId of clientIds) {
    if (await filter.isVisible()) await filter.fill(clientId);
    await dialog.getByRole("checkbox", { name: clientId }).check();
  }
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Access updated")).toBeVisible();
}

/** APIs page, "Change" next to Applications: links applications, keeping the API open to every one. */
export async function linkApplications(page: Page, api: TestApi, clientIds: string[]) {
  await page.goto("/en/apis");
  await page.getByRole("button", { name: `Change which applications can use ${api.name}` }).click();
  const dialog = page.getByRole("dialog");
  const filter = dialog.getByRole("searchbox", { name: "Filter applications" });
  for (const clientId of clientIds) {
    if (await filter.isVisible()) await filter.fill(clientId);
    await dialog.getByRole("checkbox", { name: clientId }).check();
  }
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Access updated")).toBeVisible();
}

/** Picks an option of a Radix select (combobox) by its label. */
export async function selectOption(page: Page, scope: import("@playwright/test").Locator, label: string | RegExp, option: string | RegExp) {
  await scope.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).click();
}
