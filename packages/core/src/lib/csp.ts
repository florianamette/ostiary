/**
 * Content Security Policy of both apps. Pages get a per-request nonce from the proxy
 * (apps/<app>/proxy.ts): Next.js reads it from the request's CSP header and puts it on its own
 * scripts, and `'strict-dynamic'` lets those scripts load the rest (route chunks, the captcha
 * and Google One Tap scripts). No inline script runs without the nonce and nothing is
 * `eval`ed in production. Routes the proxy does not see (API routes, static files) keep a
 * fixed policy from next.config.
 *
 * Relative import only: next.config reads this file before path aliases exist.
 */
import { captchaCspSources } from "./captcha-providers";

type Sources = { script: string[]; style: string[]; connect: string[]; frame: string[] };

/**
 * Google One Tap (when turned on in the admin console) runs on the sign-in and sign-up pages
 * only: Google Identity Services' script, its prompt's iframe and stylesheet, and its FedCM
 * and status requests, all under accounts.google.com/gsi/ (Google's documented CSP).
 */
const GOOGLE_GSI: Sources = {
  script: ["https://accounts.google.com/gsi/client"],
  style: ["https://accounts.google.com/gsi/style"],
  connect: ["https://accounts.google.com/gsi/"],
  frame: ["https://accounts.google.com/gsi/"],
};

const NONE: Sources = { script: [], style: [], connect: [], frame: [] };

export type CspOptions = {
  /** Per-request nonce (base64). Without one, the fixed policy for routes the proxy skips. */
  nonce?: string;
  /** `next dev`: React needs `eval` for its debugging aids. */
  dev?: boolean;
  /** CAPTCHA_PROVIDER: its script, iframe and requests (auth app pages). */
  captchaProvider?: string;
  /** Google One Tap's sources (sign-in and sign-up pages). */
  googleOneTap?: boolean;
};

export function contentSecurityPolicy({ nonce, dev = false, captchaProvider, googleOneTap = false }: CspOptions = {}): string {
  const captcha = captchaCspSources(captchaProvider);
  const gsi = googleOneTap ? GOOGLE_GSI : NONE;
  const script = [
    "'self'",
    // With a nonce, 'strict-dynamic' makes browsers ignore 'self' and the hosts below: only
    // nonced scripts and what they load run. Without one, no inline script runs at all.
    ...(nonce ? [`'nonce-${nonce}'`, "'strict-dynamic'"] : []),
    ...(dev ? ["'unsafe-eval'"] : []),
    ...captcha.script,
    ...gsi.script,
  ];
  const frame = [...captcha.frame, ...gsi.frame];
  return [
    "default-src 'self'",
    `script-src ${script.join(" ")}`,
    // Inline styles stay allowed: React style attributes, Radix and Framer Motion set them.
    ["style-src 'self' 'unsafe-inline'", ...captcha.style, ...gsi.style].join(" "),
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    ["connect-src 'self'", ...captcha.connect, ...gsi.connect].join(" "),
    ...(frame.length ? [`frame-src ${frame.join(" ")}`] : []),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** A fresh nonce: 128 random bits, base64. */
export function createCspNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/** Request header the proxy passes the nonce in, for server components that render scripts. */
export const NONCE_HEADER = "x-nonce";
