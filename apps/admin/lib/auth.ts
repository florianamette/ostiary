import { createAppAuth } from "@ostiary/core/lib/app-auth";
import { env } from "@ostiary/core/lib/env";

if (!env.AUTH_APP_URL || !env.ADMIN_APP_URL) {
  throw new Error("AUTH_APP_URL and ADMIN_APP_URL are required by the admin app");
}

/**
 * Same Better Auth configuration as the auth app. Its canonical URL stays the auth app's; this
 * app's origin is trusted (getTrustedOrigins), so requests from its UI pass the origin check.
 */
export const auth = createAppAuth({ baseURL: env.AUTH_APP_URL });
