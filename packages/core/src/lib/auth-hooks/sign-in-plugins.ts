import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware, getOAuthState } from "better-auth/api";
import type { twoFactor } from "better-auth/plugins/two-factor";

import { recordAuthEvent } from "@ostiary/core/lib/auth-events";
import { isExternalSignInPath, twoFactorStepURL } from "@ostiary/core/lib/security/external-sign-in";
import { type Bag, str } from "@ostiary/core/lib/auth-hooks/values";

/** Password sign-in endpoints whose failures are counted for the security page. */
export const PASSWORD_SIGN_IN_PATHS = new Set(["/sign-in/email", "/sign-in/username"]);

/** Sign-ins that may stop for two-factor authentication: passwords and emailed codes. */
export const TWO_STEP_SIGN_IN_PATHS = new Set([...PASSWORD_SIGN_IN_PATHS, "/sign-in/email-otp"]);

type TwoFactorPlugin = ReturnType<typeof twoFactor>;

type HookContext = {
    path?: string;
    headers?: Headers;
    context: {
        newSession?: { session: { token: string }; user: { id: string } } | null;
        authCookies: { sessionToken: { name: string } };
    };
};

/**
 * Whether this request just started a session it did not already have: an external sign-in
 * (social, SSO, One Tap, verification link). Signing in again re-sets the cookie of the
 * session the browser already had (verify-email while signed in), which is not a new sign-in.
 */
function startedNewSession(ctx: HookContext): boolean {
    const created = ctx.context.newSession;
    if (!created) return false;
    const name = ctx.context.authCookies.sessionToken.name;
    for (const part of (ctx.headers?.get("cookie") ?? "").split(";")) {
        const index = part.indexOf("=");
        if (index < 0 || part.slice(0, index).trim() !== name) continue;
        const value = decodeURIComponent(part.slice(index + 1).trim());
        if (value.split(".")[0] === created.session.token) return false;
    }
    return true;
}

/**
 * Records a password or code sign-in once it has a session. Placed after the twoFactor plugin,
 * whose hook deletes the session (and clears `newSession`) while the second step is pending: that
 * sign-in is counted when the code is verified, by the session hook.
 */
export const passwordSignInEvents = {
    id: "ostiary-password-sign-in-events",
    hooks: {
        after: [
            {
                // External sign-ins too: they may stop for two-factor authentication as well.
                matcher: (ctx) => TWO_STEP_SIGN_IN_PATHS.has(ctx.path ?? "") || (isExternalSignInPath(ctx.path) && startedNewSession(ctx)),
                handler: createAuthMiddleware(async (ctx) => {
                    const created = ctx.context.newSession;
                    if (created) await recordAuthEvent("sign_in", created.user.id);
                }),
            },
        ],
    },
} satisfies BetterAuthPlugin;

/**
 * The twoFactor plugin asks for the second step after password sign-ins only. A sign-in
 * code proves the inbox: one factor, like a password. Run the same check after it (trusted
 * device, else the /two-factor challenge), so a code never skips an authenticator.
 */
export function emailCodeTwoFactor(twoFactorPlugin: TwoFactorPlugin) {
    return {
        id: "ostiary-email-code-two-factor",
        hooks: {
            after: twoFactorPlugin.hooks.after.map((hook) => ({
                ...hook,
                matcher: (ctx: { path?: string }) => ctx.path === "/sign-in/email-otp",
            })),
        },
    } satisfies BetterAuthPlugin;
}

const isTwoFactorChallenge = (value: unknown) =>
    Boolean(value && typeof value === "object" && !(value instanceof Error) && (value as Bag).twoFactorRedirect === true);

/**
 * The same second step after sign-ins that skip the password: social providers (redirect,
 * ID token, One Tap), SSO and the verification link. An account with two-factor
 * authentication keeps it whatever the way in, so REQUIRE_ADMIN_2FA holds for every admin
 * session. The two-factor plugin's own check runs first (trusted device, else the session is
 * deleted and the short-lived two-factor cookie set); a browser redirect then goes to the
 * two-factor page instead of the sign-in's destination, which it continues to afterwards
 * (the app's authorization request, when one is pending). JSON sign-ins (One Tap, ID token)
 * answer `twoFactorRedirect` like a password sign-in.
 */
export function externalSignInTwoFactor(twoFactorPlugin: TwoFactorPlugin, baseURL: string) {
    return {
        id: "ostiary-external-sign-in-two-factor",
        hooks: {
            after: [
                ...twoFactorPlugin.hooks.after.map((hook) => ({
                    ...hook,
                    matcher: (ctx: HookContext) => isExternalSignInPath(ctx.path) && startedNewSession(ctx),
                })),
                {
                    matcher: (ctx: HookContext & { context: { returned?: unknown; responseHeaders?: Headers } }) =>
                        isExternalSignInPath(ctx.path) &&
                        isTwoFactorChallenge(ctx.context.returned) &&
                        Boolean(ctx.context.responseHeaders?.get("location")),
                    handler: createAuthMiddleware(async (ctx) => {
                        const serverContext = (await getOAuthState())?.serverContext as Bag | undefined;
                        throw ctx.redirect(
                            twoFactorStepURL(baseURL, {
                                location: ctx.context.responseHeaders?.get("location"),
                                oauthQuery: str(serverContext?.query),
                            }),
                        );
                    }),
                },
            ],
        },
    } satisfies BetterAuthPlugin;
}
