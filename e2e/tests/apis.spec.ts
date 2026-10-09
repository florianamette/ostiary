import { newApi, limitApiToLinked, registerApi } from "../support/admin";
import { expect, test } from "../support/fixtures";
import { clientCredentials, createClient, kidOf, verifyJwt, waitForScope } from "../support/oauth";

/*
 * APIs (OAuth protected resources) registered from the admin console. Their scopes come from
 * the database at runtime (syncProviderScopes, oauth-scopes.ts) and per-client access from
 * Better Auth's client/resource links plus Ostiary's "open API" adapter (withOpenApiLinks,
 * oauth-resource-access.ts, with enforcePerClientResources). Both rely on Better Auth internals.
 */

test("an API registered in the console becomes requestable without a restart", async ({ adminPage, adminApi, api }) => {
  const resource = newApi("orders");
  await registerApi(adminPage, resource);

  // The auth server reloads its scopes from the database (within a minute) and advertises them.
  await waitForScope(api, resource.scopes[0]!);

  const client = await createClient(adminApi, {
    grant_types: ["client_credentials"],
    scope: resource.scopes[0],
  });
  const response = await clientCredentials(api, client, resource.scopes[0]!, resource.identifier);
  expect(response.status(), await response.text()).toBe(200);
  const token = (await response.json()) as { access_token: string; scope: string };
  expect(token.scope).toBe(resource.scopes[0]);

  const claims = await verifyJwt(api, token.access_token, resource.identifier);
  expect(claims).toMatchObject({ aud: resource.identifier, azp: client.client_id, scope: resource.scopes[0] });
  expect(kidOf(token.access_token)).toBeTruthy();

  // A scope the client was not granted is refused.
  const refused = await clientCredentials(api, client, resource.scopes[1]!, resource.identifier);
  expect(refused.status()).toBe(400);
  expect(await refused.json()).toMatchObject({ error: "invalid_scope" });
});

test("an API limited to linked applications refuses the others", async ({ adminPage, adminApi, api }) => {
  const resource = newApi("ledger");
  await registerApi(adminPage, resource);
  await waitForScope(api, resource.scopes[0]!);

  const linked = await createClient(adminApi, { grant_types: ["client_credentials"], scope: resource.scopes[0] });
  const unlinked = await createClient(adminApi, { grant_types: ["client_credentials"], scope: resource.scopes[0] });

  // Open to every application by default.
  const before = await clientCredentials(api, unlinked, resource.scopes[0]!, resource.identifier);
  expect(before.status(), await before.text()).toBe(200);

  await limitApiToLinked(adminPage, resource, [linked.client_id]);

  const refused = await clientCredentials(api, unlinked, resource.scopes[0]!, resource.identifier);
  expect(refused.status()).toBe(400);
  expect(await refused.json()).toMatchObject({ error: "invalid_target" });

  const accepted = await clientCredentials(api, linked, resource.scopes[0]!, resource.identifier);
  expect(accepted.status(), await accepted.text()).toBe(200);
  const { access_token } = (await accepted.json()) as { access_token: string };
  expect(await verifyJwt(api, access_token, resource.identifier)).toMatchObject({ aud: resource.identifier });
});
