import type { Page } from "@playwright/test";

import { createUser } from "../support/auth";
import { query } from "../support/db";
import { expect, test } from "../support/fixtures";
import { connectApp, createClient, verifyJwt, type Client } from "../support/oauth";

/*
 * RP-initiated logout (OpenID Connect RP-Initiated Logout 1.0): an application registered with
 * "Sign-out from the app" (enable_end_session) may send the user to the end-session endpoint
 * with its ID token, which ends the session and sends the user back to a registered
 * post-logout redirect URI. Other applications are refused, and their ID tokens carry no sid.
 */

const POST_LOGOUT_URL = "https://app.e2e.test/signed-out";
const SCOPE = "openid profile email";

type EndSessionRow = { enable_end_session: boolean | null; post_logout_redirect_uris: string[] | null };

async function endSessionRow(clientId: string): Promise<EndSessionRow | undefined> {
  const rows = await query<EndSessionRow>(
    "select enable_end_session, post_logout_redirect_uris from oauth_client where client_id = $1",
    [clientId],
  );
  return rows[0];
}

function endSessionUrl(params: Record<string, string>) {
  return `/api/auth/oauth2/end-session?${new URLSearchParams(params).toString()}`;
}

async function signedIn(page: Page): Promise<boolean> {
  const response = await page.request.get("/api/auth/get-session");
  const body: unknown = await response.json().catch(() => null);
  return Boolean(body && typeof body === "object" && "session" in body);
}

test("an app with sign-out ends the session and returns to its post-logout URI", async ({ api, adminApi, page }) => {
  const user = await createUser(api, "endsession");
  const { client, tokens } = await connectApp(page, api, adminApi, user, SCOPE, {
    enable_end_session: true,
    post_logout_redirect_uris: [POST_LOGOUT_URL],
  });
  expect(await endSessionRow(client.client_id)).toEqual({ enable_end_session: true, post_logout_redirect_uris: [POST_LOGOUT_URL] });
  const idToken = await verifyJwt(api, tokens.id_token!, client.client_id);
  expect(typeof idToken.sid).toBe("string");
  expect(await signedIn(page)).toBe(true);

  // The browser's own navigation, with its cookies; the redirect is read rather than followed
  // (the post-logout page is not a real host).
  const response = await page.request.get(
    endSessionUrl({ id_token_hint: tokens.id_token!, post_logout_redirect_uri: POST_LOGOUT_URL, state: "after-logout" }),
    { headers: { accept: "text/html", "sec-fetch-mode": "navigate" }, maxRedirects: 0 },
  );
  expect(response.status(), await response.text()).toBe(302);
  expect(response.headers().location).toBe(`${POST_LOGOUT_URL}?state=after-logout`);
  expect(await signedIn(page)).toBe(false);
  const sessions = await query<{ id: string }>("select id from session where id = $1", [idToken.sid as string]);
  expect(sessions).toEqual([]);
});

test("an app without sign-out is refused and its ID tokens carry no sid", async ({ api, adminApi, page }) => {
  const user = await createUser(api, "nosignout");
  const { client, tokens } = await connectApp(page, api, adminApi, user, SCOPE);
  // Off unless asked for: clients registered before the option existed keep working as they did.
  expect((await endSessionRow(client.client_id))?.enable_end_session).not.toBe(true);
  const idToken = await verifyJwt(api, tokens.id_token!, client.client_id);
  expect(idToken).not.toHaveProperty("sid");

  const response = await page.request.get(endSessionUrl({ id_token_hint: tokens.id_token!, client_id: client.client_id }));
  expect(response.status()).toBe(401);
  expect(await response.json()).toMatchObject({ error: "invalid_client" });
  expect(await signedIn(page)).toBe(true);
});

test("post-logout redirect URIs need sign-out", async ({ adminApi }) => {
  const response = await adminApi.post("/api/admin/oauth-clients", {
    data: { redirect_uris: ["https://app.e2e.test/callback"], post_logout_redirect_uris: [POST_LOGOUT_URL] },
  });
  expect(response.status()).toBe(400);
  expect(await response.text()).toContain("enable_end_session");
});

async function openEdit(page: Page, client: Client) {
  await page.goto(`/en/applications?q=${encodeURIComponent(client.client_id)}`);
  await page.getByRole("button", { name: `Actions for ${client.client_name}` }).click();
  await page.getByRole("menuitem", { name: "Edit application" }).click();
  return page.getByRole("dialog");
}

test("sign-out is on for apps registered in the console and can be turned off and on", async ({ adminApi, adminPage }) => {
  const name = `e2e signout ${Date.now()}`;
  await adminPage.goto("/en/applications");
  await adminPage.getByRole("button", { name: "Register application" }).click();
  const register = adminPage.getByRole("dialog");
  await register.getByLabel("Application name").fill(name);
  await register.getByLabel("Redirect URIs", { exact: true }).fill("https://app.e2e.test/callback");
  const option = register.getByRole("checkbox", { name: "Sign-out from the app (RP-initiated logout)" });
  await expect(option).toBeChecked();
  await register.getByLabel("Post-logout redirect URIs (optional)").fill(POST_LOGOUT_URL);
  await register.getByRole("button", { name: "Create application" }).click();
  await expect(register.getByText("Client ID", { exact: true })).toBeVisible();
  const clientId = await register.locator("input[readonly]").first().inputValue();
  await register.getByRole("button", { name: "Done" }).click();
  expect(await endSessionRow(clientId)).toEqual({ enable_end_session: true, post_logout_redirect_uris: [POST_LOGOUT_URL] });

  const client = { client_id: clientId, client_name: name };
  let edit = await openEdit(adminPage, client);
  const editOption = edit.getByRole("checkbox", { name: "Sign-out from the app (RP-initiated logout)" });
  await expect(editOption).toBeChecked();
  await expect(edit.getByLabel("Post-logout redirect URIs (optional)")).toHaveValue(POST_LOGOUT_URL);
  await editOption.uncheck();
  await expect(edit.getByLabel("Post-logout redirect URIs (optional)")).toBeHidden();
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(adminPage.getByText("Application updated")).toBeVisible();
  // Off, the URIs are kept for when it is turned back on.
  expect(await endSessionRow(clientId)).toEqual({ enable_end_session: false, post_logout_redirect_uris: [POST_LOGOUT_URL] });

  const audit = await query<{ metadata: { fields?: string[] } }>(
    "select metadata from audit_log where action = 'oauth_client.update' and target_id = $1 order by created_at desc limit 1",
    [clientId],
  );
  expect(audit[0]?.metadata.fields).toContain("enable_end_session");

  // An existing app, registered without it, can be given it; clearing the URIs removes them.
  const older = await createClient(adminApi, { scope: SCOPE });
  edit = await openEdit(adminPage, older);
  await expect(edit.getByRole("checkbox", { name: "Sign-out from the app (RP-initiated logout)" })).not.toBeChecked();
  await edit.getByRole("checkbox", { name: "Sign-out from the app (RP-initiated logout)" }).check();
  await edit.getByLabel("Post-logout redirect URIs (optional)").fill(`${POST_LOGOUT_URL}\nhttps://app.e2e.test/bye`);
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(adminPage.getByText("Application updated")).toBeVisible();
  expect(await endSessionRow(older.client_id)).toEqual({
    enable_end_session: true,
    post_logout_redirect_uris: [POST_LOGOUT_URL, "https://app.e2e.test/bye"],
  });

  edit = await openEdit(adminPage, older);
  await edit.getByLabel("Post-logout redirect URIs (optional)").fill("");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(adminPage.getByText("Application updated").first()).toBeVisible();
  await expect.poll(async () => (await endSessionRow(older.client_id))?.post_logout_redirect_uris).toBeNull();
});
