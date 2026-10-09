import {
    adminClient,
    emailOTPClient,
    jwtClient,
    lastLoginMethodClient,
    multiSessionClient,
    oneTapClient,
    organizationClient,
    twoFactorClient,
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
            emailOTPClient(),
            passkeyClient(),
            // No redirect option: the login form reads `twoFactorRedirect` and opens the code step.
            twoFactorClient(),
            organizationClient(),
            oauthProviderClient(),
            adminClient(),
            ssoClient(),
            multiSessionClient(),
        ],
    });
}

/**
 * Browser client for Google One Tap on the sign-in and sign-up pages, with the client ID the
 * admin console set (read by the page on the server). Separate from the app's client because
 * that one is created before the client ID is known. It also sends the signed OAuth request of
 * the page, like every other sign-in, so an app's authorization resumes after One Tap.
 */
export function createOneTapAuthClient(baseURL: string | undefined, clientId: string) {
    return createAuthClient({
        baseURL,
        plugins: [
            oauthProviderClient(),
            oneTapClient({
                clientId,
                // FedCM (the browser's own prompt) where supported, which Chrome requires.
                // Dismissed or not shown: no retry, the page stays as it is.
                promptOptions: { fedCM: true, maxAttempts: 0 },
            }),
        ],
    });
}
