import { createAuth } from "@ostiary/core/lib/auth-factory";
import { env } from "@ostiary/core/lib/env";
import { getTrustedOrigins } from "@ostiary/core/lib/url";

if (!env.AUTH_APP_URL || !env.ADMIN_APP_URL) {
  throw new Error("AUTH_APP_URL and ADMIN_APP_URL are required by the admin app");
}

/**
 * Same Better Auth configuration as the auth app, same database and secret. The canonical
 * URL stays the auth app so SSO callbacks and invitation links point at the right place.
 * This app's origin is trusted, so requests from its UI pass the origin check.
 */
export const auth = createAuth({
  baseURL: env.AUTH_APP_URL,
  trustedOrigins: getTrustedOrigins(),
  cookieDomain: env.COOKIE_DOMAIN,
});
