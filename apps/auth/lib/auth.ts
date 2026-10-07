import { createAuth } from "@ostiary/core/lib/auth-factory";
import { env } from "@ostiary/core/lib/env";
import { getBaseURL, getTrustedOrigins } from "@ostiary/core/lib/url";

/** The auth app is the canonical Better Auth server: OIDC issuer, SSO callbacks, emails. */
export const auth = createAuth({
  baseURL: env.AUTH_APP_URL ?? getBaseURL(),
  trustedOrigins: getTrustedOrigins(),
  cookieDomain: env.COOKIE_DOMAIN,
});
