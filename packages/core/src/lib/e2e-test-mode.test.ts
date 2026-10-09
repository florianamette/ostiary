import { describe, expect, it } from "vitest";

import { isE2eTestMode } from "@ostiary/core/lib/e2e-test-mode";

describe("isE2eTestMode", () => {
  const local = { E2E_TEST_MODE: "true", AUTH_APP_URL: "http://localhost:3220" };

  it("is on only when asked for, on a loopback http URL", () => {
    expect(isE2eTestMode(local)).toBe(true);
    expect(isE2eTestMode({ ...local, AUTH_APP_URL: "http://127.0.0.1:3000" })).toBe(true);
    expect(isE2eTestMode({ E2E_TEST_MODE: "true", BETTER_AUTH_URL: "http://localhost:3000" })).toBe(true);
  });

  it("is off without the variable", () => {
    expect(isE2eTestMode({ AUTH_APP_URL: "http://localhost:3220" })).toBe(false);
    expect(isE2eTestMode({ ...local, E2E_TEST_MODE: "1" })).toBe(false);
  });

  it("is off on a real deployment even if the variable leaked", () => {
    expect(isE2eTestMode({ ...local, AUTH_APP_URL: "https://auth.example.com" })).toBe(false);
    expect(isE2eTestMode({ ...local, AUTH_APP_URL: "http://auth.example.com" })).toBe(false);
    expect(isE2eTestMode({ ...local, AUTH_APP_URL: "https://localhost:3220" })).toBe(false);
    expect(isE2eTestMode({ ...local, VERCEL_ENV: "production" })).toBe(false);
    expect(isE2eTestMode({ E2E_TEST_MODE: "true" })).toBe(false);
    expect(isE2eTestMode({ ...local, AUTH_APP_URL: "not a url" })).toBe(false);
  });
});
