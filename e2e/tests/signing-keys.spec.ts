import { expect, test } from "../support/fixtures";
import { ENV_API, clientCredentials, createClient, jwks, kidOf, verifyJwt } from "../support/oauth";

/*
 * Signing key rotation (signing-keys.ts) creates the key with Better Auth's createJwk and retires
 * the others by setting their expiry; Better Auth must then sign with the new key and keep
 * publishing the old one for the grace period.
 */
test("rotating the signing key keeps old tokens verifiable", async ({ adminPage, adminApi, api }) => {
  const client = await createClient(adminApi, { grant_types: ["client_credentials"], scope: ENV_API.scopes[0] });
  const issue = async () => {
    const response = await clientCredentials(api, client, ENV_API.scopes[0], ENV_API.identifier);
    expect(response.status(), await response.text()).toBe(200);
    return ((await response.json()) as { access_token: string }).access_token;
  };

  const before = await issue();
  const oldKid = kidOf(before);
  expect(oldKid).toBeTruthy();

  await adminPage.goto("/en/signing-keys");
  await adminPage.getByRole("button", { name: "Rotate now" }).click();
  await adminPage.getByRole("dialog").getByRole("button", { name: "Rotate now" }).click();
  const toast = adminPage.getByText(/Key rotated\. New tokens use key /);
  await expect(toast).toBeVisible();
  const newKid = (await toast.textContent())!.match(/use key (\S+?)\.?$/)![1]!;
  expect(newKid).not.toBe(oldKid);

  // New tokens carry the new key id, at once (Better Auth reads the latest key per request).
  const after = await issue();
  expect(kidOf(after)).toBe(newKid);

  // Both keys are published, and a token signed before the rotation still verifies.
  const kids = (await jwks(api)).keys.map((key) => key.kid);
  expect(kids).toEqual(expect.arrayContaining([oldKid, newKid]));
  expect(await verifyJwt(api, before, ENV_API.identifier)).toMatchObject({ azp: client.client_id });
  expect(await verifyJwt(api, after, ENV_API.identifier)).toMatchObject({ azp: client.client_id });

  // The console lists the new key as the current one and the old one as retired.
  await adminPage.reload();
  await expect(adminPage.getByRole("row", { name: new RegExp(`^${newKid} Current`) })).toBeVisible();
  await expect(adminPage.getByRole("row", { name: new RegExp(`^${oldKid} `) })).not.toContainText("Current");
});
