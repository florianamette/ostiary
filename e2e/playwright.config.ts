import { defineConfig, devices } from "@playwright/test";

import { ADMIN_URL, AUTH_URL, MOCK_URL, env } from "./support/env";

const CI = Boolean(process.env.CI);

/** `next start` for one app, with the test environment (e2e/.env.test). */
function nextStart(app: "auth" | "admin", url: string) {
  const port = new URL(url).port;
  return {
    command: `pnpm --dir ../apps/${app} exec next start -p ${port}`,
    url: `http://127.0.0.1:${port}${app === "auth" ? "/api/auth/ok" : "/icon"}`,
    env: env as Record<string, string>,
    reuseExistingServer: !CI,
    timeout: 60_000,
    stdout: "pipe" as const,
    stderr: "pipe" as const,
  };
}

/*
 * The apps must be built first (pnpm build:apps) and the database migrated (pnpm db:setup).
 * See README, "Testing".
 */
export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  forbidOnly: CI,
  workers: CI ? 3 : 2,
  retries: CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: CI ? [["list"], ["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: AUTH_URL,
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  webServer: [
    nextStart("auth", AUTH_URL),
    nextStart("admin", ADMIN_URL),
    {
      command: "node mock-server.mjs",
      url: `${MOCK_URL}/health`,
      env: env as Record<string, string>,
      reuseExistingServer: !CI,
      stdout: "pipe",
    },
  ],
});
