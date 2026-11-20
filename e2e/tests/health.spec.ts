import { ADMIN_URL, AUTH_URL } from "../support/env";
import { expect, test } from "../support/fixtures";

/* GET /api/health on both apps (packages/core/src/db/index.ts, databaseReachable). */

for (const [app, base] of [["auth", AUTH_URL], ["admin", ADMIN_URL]] as const) {
  test(`${app} app answers its health check`, async ({ request }) => {
    const response = await request.get(`${base}/api/health`);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
  });
}
