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

type CspSources = { script: string[]; style: string[]; connect: string[]; frame: string[] };

function csp(extra: CspSources) {
  const frame = [...captcha.frame, ...extra.frame];
  return [
    "default-src 'self'",
    sources("script-src 'self' 'unsafe-inline' 'unsafe-eval'", ...captcha.script, ...extra.script),
    sources("style-src 'self' 'unsafe-inline'", ...captcha.style, ...extra.style),
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    sources("connect-src 'self'", ...captcha.connect, ...extra.connect),
    ...(frame.length ? [sources("frame-src", ...frame)] : []),
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const cspDirectives = csp({ script: [], style: [], connect: [], frame: [] });

// Google One Tap (when turned on in the admin console) runs on the sign-in and sign-up pages
// only: Google Identity Services' script, its prompt's iframe and stylesheet, and its FedCM
// and status requests, all under accounts.google.com/gsi/ (Google's documented CSP). Every
// other page, consent and the dashboard included, keeps the policy above.
const GOOGLE_GSI = {
  script: ["https://accounts.google.com/gsi/client"],
  style: ["https://accounts.google.com/gsi/style"],
  connect: ["https://accounts.google.com/gsi/"],
  frame: ["https://accounts.google.com/gsi/"],
};
const signInCspDirectives = csp(GOOGLE_GSI);

const APP_ICON_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

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
      // Listed after the rule above so this CSP replaces it on these pages.
      ...["/:locale/login", "/:locale/signup"].map((source) => ({
        source,
        headers: [{ key: "Content-Security-Policy", value: signInCspDirectives }],
      })),
      // App icons are images fetched from other sites (possibly SVG): opened on their own they
      // must not run scripts or load anything. Listed last so this CSP replaces the one above.
      {
        source: "/api/app-icon/:clientId",
        headers: [{ key: "Content-Security-Policy", value: APP_ICON_CSP }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
