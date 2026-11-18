import { createAuth } from "@ostiary/core/lib/auth-factory";
import { env } from "@ostiary/core/lib/env";
import { recoverableAuth } from "@ostiary/core/lib/recoverable-auth";
import { getTrustedOrigins } from "@ostiary/core/lib/url";

/**
 * The Better Auth instance of an app. Both apps run the same configuration against the same
 * database and secret; `baseURL` is always the auth app's, so SSO callbacks, invitation and
 * verification links point there. Rebuilt when its start fails (database unreachable), see
 * recoverableAuth.
 */
export function createAppAuth({ baseURL }: { baseURL: string }) {
  return recoverableAuth(() =>
    createAuth({
      baseURL,
      trustedOrigins: getTrustedOrigins(),
      cookieDomain: env.COOKIE_DOMAIN,
    }),
  );
}
