/**
 * Response headers of both apps, for `headers()` in their next.config.
 *
 * No path aliases here: next.config reads this file before they exist.
 */

const isProd = process.env.NODE_ENV === "production";

const IMAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/**
 * `csp`: the fixed policy for every route. `imageRoutes`: routes serving app icons and sign-in
 * branding images fetched from other sites (possibly SVG). Opened on their own they must not
 * run scripts or load anything, so they get a sandbox CSP, listed last so it replaces the first.
 */
export function securityHeaders({ csp, imageRoutes }: { csp: string; imageRoutes: string[] }) {
  const headers: { key: string; value: string }[] = [
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
    { key: "Content-Security-Policy", value: csp },
  ];

  if (isProd) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains; preload",
    });
  }

  return [
    {
      source: "/:path*",
      headers,
    },
    ...imageRoutes.map((source) => ({
      source,
      headers: [{ key: "Content-Security-Policy", value: IMAGE_CSP }],
    })),
  ];
}
