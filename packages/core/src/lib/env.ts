import { z } from "zod";

const envSchema = z
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
    VERCEL_ENV: z.string().optional(),
    VERCEL_URL: z.string().optional(),
    VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
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
    /** Comma-separated scopes for your own APIs, e.g. "orders:read,orders:write". */
    OAUTH_API_SCOPES: z.string().optional(),
    /** GitHub OAuth App credentials. "Sign in with GitHub" appears only when both are set. */
    GITHUB_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
    /** Enable verbose request logging when "true". */
    LOG_REQUESTS: z.enum(["true", "false"]).optional(),
  })
  .superRefine((data, ctx) => {
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
