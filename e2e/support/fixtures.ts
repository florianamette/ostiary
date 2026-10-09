import { randomInt } from "node:crypto";
import path from "node:path";

import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";

import { ADMIN_URL, AUTH_URL } from "./env";
import { E2E_DIR } from "./load-env.mjs";

/** Signed-in admin (with two-factor authentication), written by tests/admin.setup.ts. */
export const ADMIN_STATE = path.join(E2E_DIR, ".data", "admin-state.json");

/** A client address of its own for each test: rate limits count per IP (x-forwarded-for). */
function uniqueIp(): string {
  return `10.${randomInt(1, 255)}.${randomInt(0, 256)}.${randomInt(1, 255)}`;
}

type Fixtures = {
  clientIp: string;
  /** API requests to the auth app, as a browser on it would send them (Origin set). */
  api: APIRequestContext;
  /** A second, independent API client (another browser), with its own cookies. */
  newApi: () => Promise<APIRequestContext>;
  /** The admin console, signed in as the admin. */
  adminPage: Page;
  /** Requests to the admin app's routes, signed in as the admin. */
  adminApi: APIRequestContext;
};

export const test = base.extend<Fixtures>({
  clientIp: async ({}, use) => use(uniqueIp()),
  extraHTTPHeaders: async ({ clientIp }, use) => use({ "x-forwarded-for": clientIp }),
  newApi: async ({ playwright, clientIp }, use) => {
    const contexts: APIRequestContext[] = [];
    await use(async () => {
      const context = await playwright.request.newContext({
        baseURL: AUTH_URL,
        extraHTTPHeaders: { origin: AUTH_URL, "x-forwarded-for": clientIp },
      });
      contexts.push(context);
      return context;
    });
    await Promise.all(contexts.map((context) => context.dispose()));
  },
  api: async ({ newApi }, use) => use(await newApi()),
  adminPage: async ({ browser, clientIp }, use) => {
    const context = await browser.newContext({
      storageState: ADMIN_STATE,
      baseURL: ADMIN_URL,
      extraHTTPHeaders: { "x-forwarded-for": clientIp },
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
  adminApi: async ({ playwright, clientIp }, use) => {
    const context = await playwright.request.newContext({
      baseURL: ADMIN_URL,
      storageState: ADMIN_STATE,
      extraHTTPHeaders: { origin: ADMIN_URL, "x-forwarded-for": clientIp },
    });
    await use(context);
    await context.dispose();
  },
});

export { expect };
