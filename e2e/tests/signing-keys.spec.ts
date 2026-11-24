import { decodeProtectedHeader } from "jose";

import { expect, test } from "../support/fixtures";
import { ENV_API, clientCredentials, createClient, jwks, kidOf, verifyJwt } from "../support/oauth";

// Both tests rotate the platform's signing key: one at a time, or each sees the other's key.
test.describe.configure({ mode: "serial" });

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

test("changing the signing algorithm signs new tokens with a key of that algorithm at once", async ({ adminPage, adminApi, api }) => {
  const client = await createClient(adminApi, { grant_types: ["client_credentials"], scope: ENV_API.scopes[0] });
  const issue = async () => {
    const response = await clientCredentials(api, client, ENV_API.scopes[0], ENV_API.identifier);
    expect(response.status(), await response.text()).toBe(200);
    return ((await response.json()) as { access_token: string }).access_token;
  };
  const algorithm = async (alg: "EdDSA (Ed25519)" | "RS256 (RSA 2048)" | "ES256 (ECDSA P-256)") => {
    await adminPage.goto("/en/signing-keys");
    await adminPage.getByRole("button", { name: "Edit" }).click();
    const dialog = adminPage.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Signing algorithm" }).click();
    await adminPage.getByRole("option", { name: alg }).click();
    await dialog.getByRole("button", { name: "Save" }).click();
    const toast = adminPage.getByText(/New tokens are signed with \S+ \(key /);
    await expect(toast).toBeVisible();
    return (await toast.textContent())!.match(/\(key (\S+?)\)/)![1]!;
  };
  const discoveryAlgs = async () =>
    ((await (await api.get("/.well-known/openid-configuration")).json()) as { id_token_signing_alg_values_supported: string[] })
      .id_token_signing_alg_values_supported;

  const before = await issue();
  try {
    const rsaKid = await algorithm("RS256 (RSA 2048)");
    const rsa = await issue();
    expect(decodeProtectedHeader(rsa)).toMatchObject({ alg: "RS256", kid: rsaKid });
    expect((await jwks(api)).keys.find((key) => key.kid === rsaKid)).toMatchObject({ kty: "RSA", alg: "RS256" });
    // Tokens signed before keep verifying with the previous key, still published.
    expect(await verifyJwt(api, before, ENV_API.identifier)).toMatchObject({ azp: client.client_id });
    expect(await verifyJwt(api, rsa, ENV_API.identifier)).toMatchObject({ azp: client.client_id });
    // Discovery follows once the auth app reloads the settings (within a minute).
    await expect.poll(discoveryAlgs, { timeout: 80_000, intervals: [2_000, 5_000] }).toEqual(["RS256"]);

    await algorithm("ES256 (ECDSA P-256)");
    expect(decodeProtectedHeader(await issue())).toMatchObject({ alg: "ES256" });
    await adminPage.reload();
    await expect(adminPage.getByRole("row", { name: /Current/ })).toContainText("ES256");
  } finally {
    // Back to the default, for the other tests.
    await algorithm("EdDSA (Ed25519)");
  }
  expect(decodeProtectedHeader(await issue())).toMatchObject({ alg: "EdDSA" });
});
