import { createAuth } from "@ostiary/core/lib/auth-factory";
import { recoverableAuth } from "@ostiary/core/lib/recoverable-auth";
import { env } from "@ostiary/core/lib/env";
import { getBaseURL, getTrustedOrigins } from "@ostiary/core/lib/url";

/**
 * The auth app is the canonical Better Auth server: OIDC issuer, SSO callbacks, emails.
 * Rebuilt when its start fails (database unreachable), see recoverableAuth.
 */
export const auth = recoverableAuth(() =>
  createAuth({
    baseURL: env.AUTH_APP_URL ?? getBaseURL(),
    trustedOrigins: getTrustedOrigins(),
    cookieDomain: env.COOKIE_DOMAIN,
  }),
);
