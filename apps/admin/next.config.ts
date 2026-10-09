import type { NextConfig } from "next";
import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Apps live in apps/*, so the monorepo root is two levels up (shared packages sit there too).
const monorepoRoot = path.resolve(import.meta.dirname, "../..");

const isProd = process.env.NODE_ENV === "production";

const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const APP_ICON_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

const nextConfig: NextConfig = {
  outputFileTracingRoot: monorepoRoot,
  turbopack: { root: monorepoRoot },
  // Sign-in branding uploads (a 256 KB logo and a 1 MB side-panel image) go through a server action.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
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
        source: "/api/admin/app-icon/:clientId",
        headers: [{ key: "Content-Security-Policy", value: APP_ICON_CSP }],
      },
      {
        source: "/api/admin/app-branding/:clientId/:asset",
        headers: [{ key: "Content-Security-Policy", value: APP_ICON_CSP }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
