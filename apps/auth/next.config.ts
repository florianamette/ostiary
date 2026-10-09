import type { NextConfig } from "next";
import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";

import { contentSecurityPolicy } from "../../packages/core/src/lib/csp";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Apps live in apps/*, so the monorepo root is two levels up (shared packages sit there too).
const monorepoRoot = path.resolve(import.meta.dirname, "../..");

const isProd = process.env.NODE_ENV === "production";

// Pages get a per-request nonce policy from proxy.ts (with the captcha's and, on sign-in and
// sign-up, Google One Tap's sources). This fixed one covers what the proxy does not see: API
// routes, static files, generated icons. No inline script runs there.
const cspDirectives = contentSecurityPolicy({
  dev: process.env.NODE_ENV === "development",
  captchaProvider: process.env.CAPTCHA_PROVIDER,
});

const APP_ICON_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: monorepoRoot,
  turbopack: { root: monorepoRoot },
  async headers() {
    const securityHeaders: { key: string; value: string }[] = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "Permissions-Policy",
        value:
          "camera=(), microphone=(), geolocation=(), publickey-credentials-get=(self), publickey-credentials-create=(self)",
      },
      { key: "Content-Security-Policy", value: cspDirectives },
    ];

    if (isProd) {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains; preload",
      });
    }

    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // App icons are images fetched from other sites (possibly SVG): opened on their own they
      // must not run scripts or load anything. Listed last so this CSP replaces the one above.
      {
        source: "/api/app-icon/:clientId",
        headers: [{ key: "Content-Security-Policy", value: APP_ICON_CSP }],
      },
      // Sign-in branding images (logo, side panel): same treatment.
      {
        source: "/api/app-branding/:clientId/:asset",
        headers: [{ key: "Content-Security-Policy", value: APP_ICON_CSP }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
