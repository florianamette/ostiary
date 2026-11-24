import { randomBytes } from "node:crypto";

import { expect, test } from "../support/fixtures";
import { CALLBACK_URL, clientCredentials, createClient, ENV_API, waitForScope } from "../support/oauth";

/*
 * An app moved from another provider keeps its client ID: the admin console may set it on
 * create (requested-client-id.ts). Better Auth still generates one when it is left out.
 */

test("an admin registers an app with its own client ID, which then gets tokens", async ({ adminPage, adminApi, api }) => {
  const clientId = `migrated-${randomBytes(4).toString("hex")}`;
  const name = `e2e custom id ${clientId}`;
  await adminPage.goto("/en/applications");
  await adminPage.getByRole("button", { name: "Register application" }).click();
  const dialog = adminPage.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Application name" }).fill(name);
  await dialog.getByLabel("Redirect URIs", { exact: true }).fill(CALLBACK_URL);
  await dialog.getByRole("textbox", { name: "Client ID (optional)" }).fill("not valid!");
  await dialog.getByRole("button", { name: "Create application" }).click();
  await expect(dialog.getByRole("alert")).toContainText("3 to 128 letters");

  await dialog.getByRole("textbox", { name: "Client ID (optional)" }).fill(clientId);
  await dialog.getByRole("button", { name: "Create application" }).click();
  await expect(dialog.getByRole("heading", { name: "Application created" })).toBeVisible();
  await expect(dialog.locator("input[readonly]").nth(0)).toHaveValue(clientId);
  await dialog.getByRole("button", { name: "Done" }).click();

  // The same ID again is refused.
  const duplicate = await adminApi.post("/api/admin/oauth-clients", {
    data: { redirect_uris: [CALLBACK_URL], client_name: `${name} again`, client_id: clientId },
  });
  expect(duplicate.status()).toBe(400);
  expect(await duplicate.text()).toContain("already has this client ID");

  // A machine client with a chosen ID authenticates with it; without one, the ID is generated.
  const scope = ENV_API.scopes[0]!;
  await waitForScope(api, scope);
  const machineId = `m2m-${randomBytes(4).toString("hex")}`;
  const machine = await createClient(adminApi, {
    client_id: machineId,
    redirect_uris: [],
    grant_types: ["client_credentials"],
    scope,
    resources: [ENV_API.identifier],
  });
  expect(machine.client_id).toBe(machineId);
  const token = await clientCredentials(api, machine, scope, ENV_API.identifier);
  expect(token.status(), await token.text()).toBe(200);
  const generated = await createClient(adminApi, {});
  expect(generated.client_id).toMatch(/^[A-Za-z]{32}$/);
});
