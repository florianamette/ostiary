import { describe, expect, it } from "vitest";

import { generateClientId, withRequestedClientId } from "@ostiary/core/lib/admin/oauth-clients/requested-client-id";

describe("generateClientId", () => {
  it("is Better Auth's default (32 letters) outside withRequestedClientId", () => {
    expect(generateClientId()).toMatch(/^[A-Za-z]{32}$/);
  });

  it("returns the requested ID inside withRequestedClientId, across awaits, and only there", async () => {
    const seen = await withRequestedClientId("legacy-app", async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return generateClientId();
    });
    expect(seen).toBe("legacy-app");
    expect(generateClientId()).not.toBe("legacy-app");
    expect(await withRequestedClientId(undefined, async () => generateClientId())).toMatch(/^[A-Za-z]{32}$/);
  });
});
