import { selectOption } from "../support/admin";
import { ISSUER } from "../support/env";
import { expect, test } from "../support/fixtures";

/* Dynamic Client Registration (RFC 7591), off by default, turned on from the console. */
test.describe.configure({ mode: "serial" });

const registration = {
  client_name: "e2e agent",
  redirect_uris: ["http://127.0.0.1:33418/callback"],
  token_endpoint_auth_method: "none",
  application_type: "native",
  grant_types: ["authorization_code", "refresh_token"],
  scope: "openid profile email offline_access",
};

async function setDynamicRegistration(page: import("@playwright/test").Page, mode: RegExp) {
  await page.goto("/en/applications");
  await page.getByRole("button", { name: "Edit" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Self-registration" });
  await selectOption(page, dialog, "Dynamic Client Registration (RFC 7591)", mode);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Settings saved/)).toBeVisible();
}

test("dynamic client registration when turned on", async ({ adminPage, api }) => {
  await setDynamicRegistration(adminPage, /^Anyone/);

  // The auth server applies the setting within a minute.
  let response: Awaited<ReturnType<typeof api.post>> | undefined;
  await expect
    .poll(
      async () => {
        response = await api.post("/api/auth/oauth2/register", { data: registration, headers: { cookie: "" } });
        return response.status();
      },
      { timeout: 80_000, intervals: [3_000] },
    )
    .toBe(201);
  const client = (await response!.json()) as { client_id: string; scope: string; client_secret?: string };
  expect(client.client_id).toBeTruthy();
  expect(client.client_secret).toBeUndefined();
  expect(client.scope).toBe(registration.scope);

  const discovery = await (await api.get("/api/auth/.well-known/openid-configuration")).json();
  expect(discovery.registration_endpoint).toBe(`${ISSUER}/oauth2/register`);

  // Self-registered clients get no machine access.
  const machine = await api.post("/api/auth/oauth2/register", {
    data: { ...registration, grant_types: ["client_credentials"], token_endpoint_auth_method: "client_secret_basic" },
  });
  expect(machine.status()).toBe(400);

  await setDynamicRegistration(adminPage, /^Off/);
  await expect
    .poll(async () => (await api.post("/api/auth/oauth2/register", { data: registration })).status(), {
      timeout: 80_000,
      intervals: [3_000],
    })
    .not.toBe(201);
});
