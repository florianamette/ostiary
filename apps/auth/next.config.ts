import type { NextConfig } from "next";
import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";

import { securityHeaders } from "../../packages/core/src/config/security-headers";
import { contentSecurityPolicy } from "../../packages/core/src/lib/csp";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Apps live in apps/*, so the monorepo root is two levels up (shared packages sit there too).
const monorepoRoot = path.resolve(import.meta.dirname, "../..");

// Pages get a per-request nonce policy from proxy.ts (with the captcha's and, on sign-in and
// sign-up, Google One Tap's sources). This fixed one covers what the proxy does not see: API
// routes, static files, generated icons. No inline script runs there.
const cspDirectives = contentSecurityPolicy({
  dev: process.env.NODE_ENV === "development",
  captchaProvider: process.env.CAPTCHA_PROVIDER,
});

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: monorepoRoot,
  turbopack: { root: monorepoRoot },
  async headers() {
    return securityHeaders({
      csp: cspDirectives,
      imageRoutes: ["/api/app-icon/:clientId", "/api/app-branding/:clientId/:asset"],
    });
  },
};

export default withNextIntl(nextConfig);
