import { createAppAuth } from "@ostiary/core/lib/app-auth";
import { env } from "@ostiary/core/lib/env";
import { getBaseURL } from "@ostiary/core/lib/url";

/** The auth app is the canonical Better Auth server: OIDC issuer, SSO callbacks, emails. */
export const auth = createAppAuth({ baseURL: env.AUTH_APP_URL ?? getBaseURL() });
