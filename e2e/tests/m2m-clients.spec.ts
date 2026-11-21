import { randomBytes } from "node:crypto";

import { newApi, registerApi, selectOption } from "../support/admin";
import { query } from "../support/db";
import { expect, test } from "../support/fixtures";
import { clientCredentials, createClient, ENV_API, verifyJwt, waitForScope } from "../support/oauth";

/*
 * Machine-to-machine clients (client_credentials only): registered from the Register
 * application dialog without redirect URIs, limited to the scopes picked there and linked to
 * their APIs. Better Auth only requires redirect URIs for the authorization_code grant.
 */

type ClientRow = { redirect_uris: string[] | null; grant_types: string[] | null; scopes: string[] | null };

test("an admin registers a machine-to-machine client in the console and it gets a token", async ({ adminPage, api }) => {
  const resource = newApi("billing");
  await registerApi(adminPage, resource);
  await waitForScope(api, resource.scopes[0]!);

  const name = `e2e m2m ${randomBytes(4).toString("hex")}`;
  await adminPage.goto("/en/applications");
  await adminPage.getByRole("button", { name: "Register application" }).click();
  const dialog = adminPage.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Application name" }).fill(name);
  await selectOption(adminPage, dialog, "Client type", "Machine-to-machine (client credentials)");

  // No redirect URIs, device sign-in or consent for a client that signs no user in.
  await expect(dialog.getByRole("textbox", { name: "Redirect URIs" })).toHaveCount(0);
  await expect(dialog.getByRole("checkbox", { name: "Device sign-in (CLIs, TVs)" })).toHaveCount(0);
  await expect(dialog.getByRole("checkbox", { name: "Skip consent (trusted client)" })).toHaveCount(0);

  // A scope is required.
  await dialog.getByRole("button", { name: "Create application" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Tick at least one scope.");

  await dialog.getByRole("checkbox", { name: resource.scopes[0]! }).check();
  await dialog.getByRole("button", { name: "Create application" }).click();
  await expect(dialog.getByRole("heading", { name: "Application created" })).toBeVisible();
  const issued = dialog.locator("input[readonly]");
  const client = { client_id: await issued.nth(0).inputValue(), client_secret: await issued.nth(1).inputValue() };
  expect(client.client_id).toBeTruthy();
  expect(client.client_secret).toBeTruthy();
  await dialog.getByRole("button", { name: "Done" }).click();

  const [row] = await query<ClientRow>("select redirect_uris, grant_types, scopes from oauth_client where client_id = $1", [client.client_id]);
  expect(row).toMatchObject({ grant_types: ["client_credentials"], scopes: [resource.scopes[0]] });
  expect(row?.redirect_uris ?? []).toEqual([]);
  const links = await query("select 1 from oauth_client_resource where client_id = $1 and resource_id = $2", [client.client_id, resource.identifier]);
  expect(links).toHaveLength(1);

  const response = await clientCredentials(api, client, resource.scopes[0]!, resource.identifier);
  expect(response.status(), await response.text()).toBe(200);
  const token = (await response.json()) as { access_token: string; scope: string; refresh_token?: string };
  expect(token.scope).toBe(resource.scopes[0]);
  expect(token.refresh_token).toBeUndefined();
  const claims = await verifyJwt(api, token.access_token, resource.identifier);
  expect(claims).toMatchObject({ aud: resource.identifier, azp: client.client_id, sub: client.client_id });

  // The scope it was not given is refused.
  const refused = await clientCredentials(api, client, resource.scopes[1]!, resource.identifier);
  expect(refused.status()).toBe(400);

  // The list shows its type; the edit dialog offers no redirect URIs or device sign-in.
  await adminPage.goto(`/en/applications?q=${encodeURIComponent(name)}`);
  const tableRow = adminPage.getByRole("row").filter({ hasText: name });
  await expect(tableRow.getByText("Machine-to-machine", { exact: true }).filter({ visible: true })).toHaveCount(1);
  await tableRow.getByRole("button", { name: `Actions for ${name}` }).click();
  await adminPage.getByRole("menuitem", { name: "Edit application" }).click();
  const edit = adminPage.getByRole("dialog");
  await expect(edit.getByRole("textbox", { name: "Application name" })).toHaveValue(name);
  await expect(edit.getByRole("textbox", { name: "Redirect URIs" })).toHaveCount(0);
  await expect(edit.getByRole("checkbox", { name: "Device sign-in (CLIs, TVs)" })).toHaveCount(0);
  await edit.getByRole("textbox", { name: "Application name" }).fill(`${name} renamed`);
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(adminPage.getByText("Application updated")).toBeVisible();
  const [renamed] = await query<{ name: string; grant_types: string[] }>("select name, grant_types from oauth_client where client_id = $1", [client.client_id]);
  expect(renamed).toMatchObject({ name: `${name} renamed`, grant_types: ["client_credentials"] });
});

test("the admin API registers a machine client without redirect URIs and validates the rest", async ({ adminApi, api }) => {
  const scope = ENV_API.scopes[0];
  const created = await adminApi.post("/api/admin/oauth-clients", {
    data: { client_name: "e2e m2m api", grant_types: ["client_credentials"], scope },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { data: client } = (await created.json()) as { data: { client_id: string; client_secret: string } };
  const token = await clientCredentials(api, client, scope, ENV_API.identifier);
  expect(token.status(), await token.text()).toBe(200);

  // A client that signs users in still needs a redirect URI.
  const noRedirect = await adminApi.post("/api/admin/oauth-clients", { data: { client_name: "e2e no redirect" } });
  expect(noRedirect.status()).toBe(400);
  expect(((await noRedirect.json()) as { error: string }).error).toMatch(/^redirect_uris:/);

  // A machine client has a secret.
  const publicMachine = await adminApi.post("/api/admin/oauth-clients", {
    data: { grant_types: ["client_credentials"], token_endpoint_auth_method: "none", scope },
  });
  expect(publicMachine.status()).toBe(400);

  // No device sign-in for a client that signs no user in.
  const device = await adminApi.patch(`/api/admin/oauth-clients/${encodeURIComponent(client.client_id)}`, {
    data: { device_code: true },
  });
  expect(device.status()).toBe(400);

  // An unknown API: the client is not left behind half linked.
  const unknownName = `e2e m2m unknown ${randomBytes(4).toString("hex")}`;
  const unknown = await adminApi.post("/api/admin/oauth-clients", {
    data: { client_name: unknownName, grant_types: ["client_credentials"], scope, resources: ["https://unknown.e2e.test"] },
  });
  expect(unknown.status()).toBeGreaterThanOrEqual(400);
  expect(unknown.status()).toBeLessThan(500);
  expect(await query("select 1 from oauth_client where name = $1", [unknownName])).toHaveLength(0);

  // Clients with redirect URIs and client_credentials keep working as before.
  await createClient(adminApi, { grant_types: ["client_credentials"], scope });
});
