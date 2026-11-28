import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";

import type { AccountEventType } from "@ostiary/core/lib/account-activity";
import { recordSecurityEvent } from "@ostiary/core/lib/security/security-change";

/*
 * "Recent activity" for the changes made through Better Auth endpoints while signed in. Email
 * and two-factor changes are written by the user update hook (database-hooks.ts), password
 * resets by the reset callback, sign-ins by the sign-in check. Changes to the sign-in methods
 * are also emailed (security/security-change.ts).
 */

const SIGNED_IN_ENDPOINTS: Record<string, AccountEventType> = {
    "/change-password": "password_changed",
    "/passkey/verify-registration": "passkey_added",
    "/passkey/register": "passkey_added",
    "/passkey/delete-passkey": "passkey_removed",
    "/revoke-session": "session_revoked",
    "/revoke-sessions": "sessions_revoked",
    "/revoke-other-sessions": "sessions_revoked",
};

export const accountActivityEvents = {
    id: "ostiary-account-activity",
    hooks: {
        after: [
            {
                matcher: (ctx) => Boolean(ctx.path && SIGNED_IN_ENDPOINTS[ctx.path]),
                handler: createAuthMiddleware(async (ctx) => {
                    if (ctx.context.returned instanceof Error) return;
                    const user = ctx.context.session?.user;
                    // An admin viewing the account (impersonation) is in the audit log instead.
                    if (!user || (ctx.context.session?.session as { impersonatedBy?: string | null } | undefined)?.impersonatedBy) return;
                    await recordSecurityEvent(SIGNED_IN_ENDPOINTS[ctx.path], user.id, ctx.headers);
                }),
            },
        ],
    },
} satisfies BetterAuthPlugin;

/** The account history entries a user update stands for (the update hook's data and path). */
export function userUpdateEvents(data: { email?: unknown; twoFactorEnabled?: unknown }, path: string | undefined): AccountEventType[] {
    if (!path || path.startsWith("/admin/")) return [];
    const events: AccountEventType[] = [];
    // The change-email link: Better Auth writes the new address when it is opened.
    if (typeof data.email === "string" && path === "/verify-email") events.push("email_changed");
    if (data.twoFactorEnabled === true) events.push("two_factor_enabled");
    if (data.twoFactorEnabled === false) events.push("two_factor_disabled");
    return events;
}
