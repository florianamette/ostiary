import { linkApplications, newApi, registerApi, selectOption } from "../support/admin";
import { createUser } from "../support/auth";
import { expect, test } from "../support/fixtures";
import { basicAuth, createClient, waitForScope } from "../support/oauth";

/* API keys: created by a user on the dashboard, verified by a linked application (api-key-verification.ts). */
test("a user creates an API key and a linked application verifies it", async ({ adminPage, adminApi, api, page }) => {
  // Admin: turn API keys on, register an API open to every application, link the verifying app.
  await adminPage.goto("/en/api-keys");
  await adminPage.getByRole("button", { name: "Edit" }).click();
  const settings = adminPage.getByRole("dialog");
  await settings.getByRole("checkbox", { name: "Allow API keys" }).check();
  await settings.getByRole("button", { name: "Save" }).click();
  await expect(adminPage.getByText(/Settings saved/)).toBeVisible();

  const resource = newApi("keys");
  await registerApi(adminPage, resource);
  await waitForScope(api, resource.scopes[0]!);
  const verifier = await createClient(adminApi, { grant_types: ["client_credentials"], scope: resource.scopes[0] });
  const stranger = await createClient(adminApi, { grant_types: ["client_credentials"], scope: resource.scopes[0] });
  await linkApplications(adminPage, resource, [verifier.client_id]);

  // User: create a key on the dashboard (a fresh sign-in is required, which this is).
  const user = await createUser(api, "keys");
  await page.context().addCookies((await api.storageState()).cookies);
  // The auth app reloads the API key settings within a minute.
  const create = page.getByRole("button", { name: "Create API key" });
  await expect(async () => {
    await page.goto("/en/dashboard");
    await expect(create).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 80_000, intervals: [3_000] });
  await create.click();
  const dialog = page.getByRole("dialog", { name: "Create an API key" });
  await dialog.getByRole("textbox", { name: "Name" }).fill("e2e script");
  await selectOption(page, dialog, "API", resource.name);
  await dialog.getByRole("checkbox", { name: resource.scopes[0] }).check();
  await dialog.getByRole("button", { name: "Create key" }).click();
  const key = (await page.getByTestId("issued-api-key").textContent())!.trim();
  expect(key).toMatch(/^ost_[A-Za-z]{64}$/);

  const verify = (client: typeof verifier, body: Record<string, string>) =>
    api.post("/api/auth/api-key/verify", { data: body, headers: { authorization: basicAuth(client) } });

  const valid = await verify(verifier, { key, resource: resource.identifier });
  expect(valid.status(), await valid.text()).toBe(200);
  expect(await valid.json()).toMatchObject({
    valid: true,
    ownerType: "user",
    userId: (await (await api.get("/api/auth/get-session")).json()).user.id,
    api: resource.identifier,
    scopes: [resource.scopes[0]],
  });

  // An API the application is not linked to.
  const otherApi = await verify(verifier, { key, resource: "https://api.e2e.test" });
  expect(otherApi.status()).toBe(403);
  expect(await otherApi.json()).toMatchObject({ error: "access_denied" });
  const unknown = await verify(verifier, { key: `ost_${"x".repeat(64)}`, resource: resource.identifier });
  expect(await unknown.json()).toMatchObject({ valid: false, error: "invalid_key" });
  const notLinked = await verify(stranger, { key, resource: resource.identifier });
  expect(notLinked.status()).toBe(403);

  // A key never signs anyone in.
  const asSession = await api.get("/api/auth/get-session", { headers: { "x-api-key": key, cookie: "" } });
  expect(await asSession.json()).toBeNull();
  expect(user.email).toBeTruthy();
});
