/**
 * next.config of both apps.
 *
 * Relative imports only: next.config reads this file before path aliases exist.
 */
import type { NextConfig } from "next";
import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";

import { contentSecurityPolicy } from "../lib/csp";
import { securityHeaders } from "./security-headers";

export type AppNextConfigOptions = {
  /** The app's directory (`import.meta.dirname` in its next.config). */
  appDir: string;
  /** Routes serving app icons and sign-in branding images: they get a sandbox CSP. */
  imageRoutes: string[];
  /** CAPTCHA_PROVIDER, when the app's pages show the captcha. */
  captchaProvider?: string;
  /** Server action request body limit, when the default (1 MB) is too small. */
  serverActionsBodyLimit?: `${number}mb`;
};

export function createNextConfig({
  appDir,
  imageRoutes,
  captchaProvider,
  serverActionsBodyLimit,
}: AppNextConfigOptions): NextConfig {
  const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
  // Apps live in apps/*, so the monorepo root is two levels up (shared packages sit there too).
  const monorepoRoot = path.resolve(appDir, "../..");

  // Pages get a per-request nonce policy from proxy.ts (with the captcha's and, on sign-in and
  // sign-up, Google One Tap's sources). This fixed one covers what the proxy does not see: API
  // routes, static files, generated icons. No inline script runs there.
  const csp = contentSecurityPolicy({ dev: process.env.NODE_ENV === "development", captchaProvider });

  const config: NextConfig = {
    poweredByHeader: false,
    // NEXT_OUTPUT=standalone builds a self-contained server for the Docker image (Dockerfile).
    ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
    outputFileTracingRoot: monorepoRoot,
    turbopack: { root: monorepoRoot },
    ...(serverActionsBodyLimit ? { experimental: { serverActions: { bodySizeLimit: serverActionsBodyLimit } } } : {}),
    async headers() {
      return securityHeaders({ csp, imageRoutes });
    },
  };
  return withNextIntl(config);
}
