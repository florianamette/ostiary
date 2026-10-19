import { z } from "zod";

import { CAPTCHA_PROVIDERS } from "@ostiary/core/lib/captcha-providers";

/** An empty value (`CAPTCHA_PROVIDER=` in a copied .env file) counts as unset. */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    /** Canonical app URL for Better Auth (server). Overrides Vercel inference when set. */
    BETTER_AUTH_URL: z.string().url().optional(),
    /** Public site URL for the browser (non-secret). Used by the auth client; optional for same-origin. */
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    /** Resend API key (server-only). Required in production for verification emails. */
    RESEND_API_KEY: z.string().min(1).optional(),
    /**
     * Verified sender for Resend, e.g. `Acme <onboarding@resend.dev>` or your domain.
     * Required in production when using email verification.
     */
    RESEND_FROM: z.string().min(3).optional(),
    /**
     * Comma-separated resource servers (APIs) that may receive JWT access tokens,
     * e.g. `https://api.example.com`. Clients request one via the `resource` parameter.
     */
    OAUTH_API_AUDIENCES: z.string().optional(),
    PORT: z.string().optional(),
    /** "1" on Vercel (set by the platform). Decides whether x-forwarded-for is trusted by default. */
    VERCEL: z.string().optional(),
    VERCEL_ENV: z.string().optional(),
    VERCEL_URL: z.string().optional(),
    VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
    /**
     * "true" adds Vercel Web Analytics to both apps (also turn it on in the Vercel project).
     * Page views are sent without query strings or fragments, which can carry tokens.
     */
    VERCEL_ANALYTICS: z.enum(["true", "false"]).optional(),
    /** Optional Sentry DSN for error tracking (server). */
    SENTRY_DSN: z.string().optional(),
    /** Origin of the auth app (canonical Better Auth URL for every app in the monorepo). */
    AUTH_APP_URL: z.string().url().optional(),
    /** Origin of the admin app. Trusted so the admin UI can call its own /api/auth route. */
    ADMIN_APP_URL: z.string().url().optional(),
    /** Parent domain shared by the apps, e.g. `.example.com`. Enables cookies that span apps. */
    COOKIE_DOMAIN: z.string().optional(),
    /**
     * Comma-separated emails that become platform admins when they sign up (first-run
     * setup: put your own address here, then sign up). Existing accounts are not changed.
     */
    ADMIN_EMAILS: z.string().optional(),
    /**
     * When "true" (default), platform admins must turn on two-factor authentication before
     * they can use the admin console. Set to "false" to let admins in without it.
     */
    REQUIRE_ADMIN_2FA: z.enum(["true", "false"]).default("true"),
    /** Comma-separated scopes for your own APIs, e.g. "orders:read,orders:write". */
    OAUTH_API_SCOPES: z.string().optional(),
    /** GitHub OAuth App credentials. "Sign in with GitHub" appears only when both are set. */
    GITHUB_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
    /**
     * Optional key (32+ characters) for the digests of SCIM provisioning tokens. Defaults to a
     * key derived from BETTER_AUTH_SECRET; set it to rotate one without the other.
     */
    SCIM_TOKEN_SECRET: z.string().min(32).optional(),
    /**
     * Optional captcha on sign-up, password sign-in, password reset and sign-in codes.
     * Off unless all three are set: the provider, its public site key and its secret key.
     */
    CAPTCHA_PROVIDER: optional(z.enum(CAPTCHA_PROVIDERS)),
    CAPTCHA_SITE_KEY: optional(z.string().min(1)),
    CAPTCHA_SECRET_KEY: optional(z.string().min(1)),
    /**
     * Rate limiting of the auth endpoints, counted in the database (table `rate_limit`) so
     * every instance shares the counts. Unset: on in production, off in development.
     */
    RATE_LIMIT_ENABLED: optional(z.enum(["true", "false"])),
    /**
     * Comma-separated request headers holding the client IP, tried in order. On Vercel the
     * default is `x-forwarded-for`, which Vercel overwrites with the real client address.
     * Elsewhere no header is trusted unless this or TRUSTED_PROXIES is set: name a header your
     * proxy sets and clients cannot (e.g. `cf-connecting-ip`, or `x-real-ip` set by nginx).
     */
    IP_ADDRESS_HEADERS: optional(z.string()),
    /**
     * Comma-separated IPs or CIDR ranges of your own proxies. When set, the client IP is the
     * right-most address in `x-forwarded-for` that is not one of them. Unset (default), a
     * header with several addresses is not trusted at all.
     */
    TRUSTED_PROXIES: optional(z.string()),
    /**
     * Secret that the webhook retry route (/api/cron/webhooks) expects as a bearer token.
     * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` by itself. Unset: the route refuses.
     */
    CRON_SECRET: optional(z.string().min(16)),
    /**
     * Development only: when "true", webhook endpoints may be http://localhost (or another
     * loopback address). Ignored when NODE_ENV is "production".
     */
    WEBHOOKS_ALLOW_LOCALHOST: optional(z.enum(["true", "false"])),
    /**
     * Prefix of new API keys (letters, digits, `_` and `-`), so they are easy to recognize and
     * to find with secret scanners. Existing keys keep theirs.
     */
    API_KEY_PREFIX: optional(z.string().regex(/^[A-Za-z0-9_-]{1,16}$/)),
    /** Enable verbose request logging when "true". */
    LOG_REQUESTS: z.enum(["true", "false"]).optional(),
  })
  .superRefine((data, ctx) => {
    const captcha = ["CAPTCHA_PROVIDER", "CAPTCHA_SITE_KEY", "CAPTCHA_SECRET_KEY"] as const;
    if (captcha.some((key) => data[key])) {
      for (const key of captcha.filter((k) => !data[k])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${key} is required when any CAPTCHA_* variable is set`,
          path: [key],
        });
      }
    }
    if (data.NODE_ENV !== "production") return;
    if (!data.RESEND_API_KEY?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "RESEND_API_KEY is required in production for email verification",
        path: ["RESEND_API_KEY"],
      });
    }
    if (!data.RESEND_FROM?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "RESEND_FROM is required in production for email verification",
        path: ["RESEND_FROM"],
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    console.error("Invalid environment variables:", fieldErrors);
    throw new Error("Invalid environment variables");
  }
  return parsed.data;
}

export const env = loadEnv();
