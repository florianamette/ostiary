import {
    adminClient,
    jwtClient,
    lastLoginMethodClient,
    organizationClient,
    usernameClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { ssoClient } from "@better-auth/sso/client";

/**
 * Browser client for one app. `baseURL` is that app's own origin, so requests stay
 * same-origin. Each app exposes only the auth routes it needs (see its api/auth route).
 */
export function createAppAuthClient(baseURL: string | undefined) {
    return createAuthClient({
        baseURL,
        plugins: [
            jwtClient(),
            lastLoginMethodClient(),
            usernameClient(),
            passkeyClient(),
            organizationClient(),
            oauthProviderClient(),
            adminClient(),
            ssoClient(),
        ],
    });
}
