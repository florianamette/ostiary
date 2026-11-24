import { randomBytes } from "node:crypto";

import { selectOption } from "../support/admin";
import { createUser, loginViaUi } from "../support/auth";
import { query } from "../support/db";
import { AUTH_URL } from "../support/env";
import { expect, test } from "../support/fixtures";
import { authorizeUrl, CALLBACK_URL, createClient, interceptCallback, pkce, tokenRequest, verifyJwt, type TokenResponse } from "../support/oauth";

/*
 * An organization's own roles (Better Auth's dynamicAccessControl) and teams, managed from the
 * admin console's organization page. Better Auth enforces a custom role's permissions, and
 * tokens carry the role, its permissions and the member's teams.
 */

test("an admin creates a role and a team; Better Auth applies the role and tokens carry both", async ({ adminPage, adminApi, api, page }) => {
  const member = await createUser(api, "orgrole");
  const orgId = `roles-${randomBytes(4).toString("hex")}`;
  const [row] = await query<{ id: string }>(`select id from "user" where email = $1`, [member.email]);
  await query(`insert into organization (id, name, slug, created_at) values ($1, $2, $1, now())`, [orgId, `Roles ${orgId}`]);
  await query(`insert into member (id, organization_id, user_id, role, created_at) values ($1, $2, $3, 'member', now())`, [`${orgId}-m`, orgId, row!.id]);

  // A role that may invite people, and nothing else.
  await adminPage.goto(`/en/organizations/${orgId}`);
  await adminPage.getByRole("button", { name: "Add role" }).click();
  const dialog = adminPage.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Role name" }).fill("recruiter");
  await dialog.getByRole("checkbox", { name: "invitation create" }).check();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(adminPage.getByText("Role saved.")).toBeVisible();
  await expect(adminPage.getByText("invitation: create")).toBeVisible();

  // A plain member may not invite; the same person with the role may.
  const invite = (email: string) =>
    page.request.post("/api/auth/organization/invite-member", { data: { email, role: "member", organizationId: orgId }, headers: { origin: AUTH_URL } });
  await loginViaUi(page, member.email, member.password);
  await page.waitForURL(/\/dashboard/);
  expect((await invite(`no-${orgId}@e2e.test`)).status()).toBe(403);

  const memberRow = adminPage.getByRole("row").filter({ hasText: member.email });
  await selectOption(adminPage, memberRow, "Role", "recruiter");
  await expect(adminPage.getByText("Role updated")).toBeVisible();
  const invited = await invite(`yes-${orgId}@e2e.test`);
  expect(invited.status(), await invited.text()).toBe(200);

  // A team, with the member in it.
  await adminPage.getByRole("textbox", { name: "New team" }).fill("Talent");
  await adminPage.getByRole("button", { name: "Create team" }).click();
  await expect(adminPage.getByText("Team created.")).toBeVisible();
  await adminPage.getByRole("textbox", { name: "Add a member to Talent" }).fill(member.email);
  await adminPage.getByRole("region", { name: "Talent" }).getByRole("button", { name: "Add" }).click();
  await expect(adminPage.getByText("Member added to the team.")).toBeVisible();
  const [team] = await query<{ id: string; member_count: number }>(`select id, member_count from team where organization_id = $1`, [orgId]);
  expect(team?.member_count).toBe(1);

  // An app whose ID tokens carry the role, its permissions and the teams of the active organization.
  const client = await createClient(adminApi, { scope: "openid email" });
  await query(`insert into oauth_client_claims (client_id, claims, updated_at) values ($1, $2, now())`, [
    client.client_id,
    JSON.stringify([
      { name: "org_role", source: "attribute", attribute: "organization.role", tokens: ["id_token"] },
      { name: "org_permissions", source: "attribute", attribute: "organization.permissions", tokens: ["id_token"] },
      { name: "org_teams", source: "attribute", attribute: "organization.teams", tokens: ["id_token"] },
    ]),
  ]);
  const active = await page.request.post("/api/auth/organization/set-active", { data: { organizationId: orgId }, headers: { origin: AUTH_URL } });
  expect(active.status(), await active.text()).toBe(200);
  const { verifier, challenge } = pkce();
  const callback = await interceptCallback(page);
  await page.goto(authorizeUrl(client, { scope: "openid email", challenge }));
  await page.waitForURL(/\/consent/);
  await page.getByRole("button", { name: "Allow" }).click();
  const code = (await callback()).searchParams.get("code")!;
  const exchanged = await tokenRequest(api, client, { grant_type: "authorization_code", code, redirect_uri: CALLBACK_URL, code_verifier: verifier });
  expect(exchanged.status(), await exchanged.text()).toBe(200);
  const claims = await verifyJwt(api, ((await exchanged.json()) as TokenResponse).id_token!, client.client_id);
  expect(claims).toMatchObject({
    org_role: "recruiter",
    org_permissions: { invitation: ["create"] },
    org_teams: [{ id: team!.id, name: "Talent" }],
  });

  // A role still held cannot be deleted.
  await adminPage.getByRole("button", { name: "Delete recruiter" }).click();
  await adminPage.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(adminPage.getByText("Members hold this role")).toBeVisible();
});
