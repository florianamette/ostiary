import { eq } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { user as userTable } from "@ostiary/core/db/schema";
import { recordAccountEvent, type AccountEventType } from "@ostiary/core/lib/account-activity";
import { clientIp } from "@ostiary/core/lib/auth-events";
import { currentAuthPolicy } from "@ostiary/core/lib/auth-policy";
import { emailLocale } from "@ostiary/core/lib/email/email-locale";
import { queueSecurityChangeEmail, SECURITY_CHANGES, type SecurityChange } from "@ostiary/core/lib/email/queue-security-change-email";
import { env } from "@ostiary/core/lib/env";
import { createSecureAccountToken } from "@ostiary/core/lib/security/new-device";
import { describeUserAgent } from "@ostiary/core/lib/security/user-agent";
import { getBaseURL } from "@ostiary/core/lib/url";

/*
 * Changes to an account's sign-in methods (password, two-factor authentication, passkeys) go in
 * its Recent activity and, unless the admin console turned it off, are emailed to the account
 * with the "This wasn't me" button of the new-device email. Callers leave out changes made by an
 * admin or while impersonating: those are in the audit log. Never throws.
 */

const EMAILED = new Set<AccountEventType>(SECURITY_CHANGES);

export function isSecurityChange(type: AccountEventType): type is SecurityChange {
    return EMAILED.has(type);
}

/** Records the event in the account's history, then emails the account about it if it is a security change. */
export async function recordSecurityEvent(type: AccountEventType, userId: string, headers: Headers | null | undefined): Promise<void> {
    await recordAccountEvent(type, userId, { headers });
    if (isSecurityChange(type)) await emailSecurityChange(type, userId, headers ?? null);
}

async function emailSecurityChange(change: SecurityChange, userId: string, headers: Headers | null): Promise<void> {
    try {
        if (!(await currentAuthPolicy()).securityChangeEmail) return;
        const [account] = await db
            .select({ id: userTable.id, email: userTable.email })
            .from(userTable)
            .where(eq(userTable.id, userId))
            .limit(1);
        if (!account) return;
        const token = await createSecureAccountToken(account.id);
        const locale = emailLocale(headers ?? undefined);
        queueSecurityChangeEmail({
            change,
            email: account.email,
            url: `${env.AUTH_APP_URL ?? getBaseURL()}/${locale}/secure-account?token=${encodeURIComponent(token)}`,
            at: new Date(),
            device: describeUserAgent(headers?.get("user-agent") ?? null),
            ipAddress: clientIp(headers),
            locale,
        });
    } catch (error) {
        console.error("security change email failed", error);
    }
}
