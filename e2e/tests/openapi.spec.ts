import { expect, test } from "../support/fixtures";

// Production default (OPENAPI_SCHEMA_ENABLED unset): no schema, and never the Scalar page, which
// loads an unpinned script from a CDN. The schema itself is apps/auth/openapi.json.
test("the OpenAPI schema and reference page are not served in production by default", async ({ api }) => {
  expect((await api.get("/api/auth/open-api/generate-schema")).status()).toBe(404);
  expect((await api.get("/api/auth/reference")).status()).toBe(404);
});
