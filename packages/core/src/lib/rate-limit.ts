import type { BetterAuthAdvancedOptions, BetterAuthRateLimitOptions } from "better-auth";

import { RATE_LIMITED_CODE } from "@ostiary/core/lib/rate-limit-message";

/**
 * Per-IP limits for the endpoints that guess secrets or send email. A rule allows `max`
 * requests, then refuses until `window` seconds have passed since the last allowed one.
 * Keys are paths under /api/auth. These replace Better Auth's built-in and plugin rules
 * for the same paths; every other endpoint keeps them (100 requests per 10 s by default).
 *
 * Counts are per client IP: people behind one address (an office, a classroom) share them,
 * so the sign-in limits leave room for several people at once.
 */
export const RATE_LIMIT_RULES = {
    // Passwords. Better Auth's default for /sign-in/* is 3 per 10 s (up to ~1,000 guesses an
    // hour); this allows bursts from a shared address but about 600 an hour at most.
    "/sign-in/email": { window: 60, max: 10 },
    "/sign-in/username": { window: 60, max: 10 },
    // Each sign-up sends a verification email.
    "/sign-up/email": { window: 300, max: 10 },
    // Each sends an email to any address: limit what one IP can send to someone's inbox.
    "/request-password-reset": { window: 600, max: 5 },
    "/send-verification-email": { window: 600, max: 5 },
    // Second step of a sign-in. Six-digit codes and backup codes; the account itself also
    // locks after repeated wrong codes (two-factor plugin).
    "/two-factor/verify-totp": { window: 60, max: 5 },
    "/two-factor/verify-backup-code": { window: 60, max: 5 },
    "/two-factor/verify-otp": { window: 60, max: 5 },
    "/two-factor/send-otp": { window: 60, max: 3 },
    // Approving a device code (signed-in user). The code lookup (/device) keeps the device
    // plugin's 5 per 10 minutes.
    "/device/approve": { window: 60, max: 10 },
    "/device/deny": { window: 60, max: 10 },
    // Machine clients, refresh flows and device polling (every 5 s) come here, often many
    // users from one server address. Every credential it accepts is long and random, so this
    // only caps load. The OAuth provider's own default is 20 a minute.
    "/oauth2/token": { window: 60, max: 300 },
    // Hot, read-only paths with nothing to guess: no counter (each counted request costs
    // database writes).
    "/get-session": false,
    "/jwks": false,
} satisfies NonNullable<BetterAuthRateLimitOptions["customRules"]>;

/**
 * Limits kept from Better Auth and its plugins, listed for the docs and tests:
 * - `/email-otp/send-verification-otp` and `/sign-in/email-otp`: 3 a minute (emailOTP option
 *   in auth-factory.ts; 3 wrong codes also void the code).
 * - `/two-factor/*` other than the paths above: 3 per 10 s.
 * - `/device` (user code lookup): 5 per 10 minutes.
 * - `/oauth2/register`: 5 a minute, plus the hourly cap from the admin console.
 * - `/oauth2/authorize`: 30 a minute; `/oauth2/userinfo`: 60; `/oauth2/introspect`: 100;
 *   `/oauth2/revoke`: 30.
 * - Other `/sign-in/*`, `/sign-up/*`, `/change-password`, `/change-email`: 3 per 10 s.
 */

type RateLimitEnv = {
    NODE_ENV?: string;
    RATE_LIMIT_ENABLED?: "true" | "false";
    IP_ADDRESS_HEADERS?: string;
    TRUSTED_PROXIES?: string;
};

function list(value: string | undefined): string[] {
    return (value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

/**
 * Counts live in Postgres (`rate_limit`), not in each serverless instance's memory, so a
 * limit holds across every instance and app. On in production unless turned off.
 */
export function rateLimitOptions(env: RateLimitEnv): BetterAuthRateLimitOptions {
    const enabled = env.RATE_LIMIT_ENABLED
        ? env.RATE_LIMIT_ENABLED === "true"
        : env.NODE_ENV === "production";
    return { enabled, storage: "database", customRules: RATE_LIMIT_RULES };
}

/**
 * Where the client IP comes from (rate limiting and the IP stored on sessions). Better
 * Auth's default is `x-forwarded-for` holding a single address: Vercel overwrites that
 * header with the real client IP. A header with several addresses is ignored unless
 * TRUSTED_PROXIES says which of them are your proxies.
 */
export function ipAddressOptions(env: RateLimitEnv): NonNullable<BetterAuthAdvancedOptions["ipAddress"]> {
    const headers = list(env.IP_ADDRESS_HEADERS).map((header) => header.toLowerCase());
    const trustedProxies = list(env.TRUSTED_PROXIES);
    return {
        ...(headers.length ? { ipAddressHeaders: headers } : {}),
        ...(trustedProxies.length ? { trustedProxies } : {}),
    };
}

/**
 * Better Auth answers a limited request with 429, `{ message }` and a non-standard
 * `X-Retry-After` header. This adds the standard `Retry-After` header (for OAuth clients
 * and other machines) and puts the code and wait in the body, so the sign-in screens can
 * say how long to wait in the user's language. Other responses pass through unchanged.
 */
export async function withRetryAfter(response: Response): Promise<Response> {
    const retryAfter = response.headers.get("x-retry-after");
    if (response.status !== 429 || !retryAfter) return response;
    const seconds = Math.max(1, Number.parseInt(retryAfter, 10) || 1);
    const headers = new Headers(response.headers);
    headers.set("Retry-After", String(seconds));
    headers.delete("content-length");
    return new Response(
        JSON.stringify({
            code: RATE_LIMITED_CODE,
            message: "Too many requests. Please try again later.",
            retryAfter: seconds,
        }),
        { status: 429, statusText: response.statusText, headers },
    );
}

type RouteHandler = (request: Request) => Promise<Response>;

/** Wraps Next.js route handlers (from `toNextJsHandler`) with {@link withRetryAfter}. */
export function withRateLimitHeaders<T extends Record<string, RouteHandler>>(handlers: T): T {
    return Object.fromEntries(
        Object.entries(handlers).map(([method, handler]) => [
            method,
            async (request: Request) => withRetryAfter(await handler(request)),
        ]),
    ) as T;
}
