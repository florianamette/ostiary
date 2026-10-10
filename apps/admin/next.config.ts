import type { NextConfig } from "next";
import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";

import { securityHeaders } from "../../packages/core/src/config/security-headers";
import { contentSecurityPolicy } from "../../packages/core/src/lib/csp";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Apps live in apps/*, so the monorepo root is two levels up (shared packages sit there too).
const monorepoRoot = path.resolve(import.meta.dirname, "../..");

// Pages get a per-request nonce policy from proxy.ts. This fixed one covers what the proxy
// does not see: API routes, static files, generated icons. No inline script runs there.
const cspDirectives = contentSecurityPolicy({ dev: process.env.NODE_ENV === "development" });

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: monorepoRoot,
  turbopack: { root: monorepoRoot },
  // Sign-in branding uploads (a 256 KB logo and a 1 MB side-panel image) go through a server action.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  async headers() {
    return securityHeaders({
      csp: cspDirectives,
      imageRoutes: ["/api/admin/app-icon/:clientId", "/api/admin/app-branding/:clientId/:asset"],
    });
  },
};

export default withNextIntl(nextConfig);
