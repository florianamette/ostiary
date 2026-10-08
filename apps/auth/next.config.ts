import type { NextConfig } from "next";
import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";

import { captchaCspSources } from "../../packages/core/src/lib/captcha-providers";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Apps live in apps/*, so the monorepo root is two levels up (shared packages sit there too).
const monorepoRoot = path.resolve(import.meta.dirname, "../..");

const isProd = process.env.NODE_ENV === "production";

// The captcha widget (when CAPTCHA_PROVIDER is set) loads a script and an iframe from its
// provider; only that provider's origins are added.
const captcha = captchaCspSources(process.env.CAPTCHA_PROVIDER);
const sources = (...list: string[]) => list.join(" ");

const cspDirectives = [
  "default-src 'self'",
  sources("script-src 'self' 'unsafe-inline' 'unsafe-eval'", ...captcha.script),
  sources("style-src 'self' 'unsafe-inline'", ...captcha.style),
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  sources("connect-src 'self'", ...captcha.connect),
  ...(captcha.frame.length ? [sources("frame-src", ...captcha.frame)] : []),
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
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
    ];
  },
};

export default withNextIntl(nextConfig);
