import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { GenericEndpointContext } from "better-auth";
import { and, eq, gt, like, lt, ne } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { knownDevice, session as sessionTable, user as userTable, verification } from "@ostiary/core/db/schema";
import { recordAudit } from "@ostiary/core/lib/audit";
import { recordAccountEvent } from "@ostiary/core/lib/account-activity";
import { clientIp } from "@ostiary/core/lib/auth-events";
import { currentAuthPolicy } from "@ostiary/core/lib/auth-policy";
import { emailLocale } from "@ostiary/core/lib/email/email-locale";
import { queueNewDeviceEmail, SECURE_ACCOUNT_LINK_DAYS } from "@ostiary/core/lib/email/queue-new-device-email";
import { env } from "@ostiary/core/lib/env";
import { describeUserAgent } from "@ostiary/core/lib/security/user-agent";
import { requestCountry } from "@ostiary/core/lib/country";
import { getBaseURL } from "@ostiary/core/lib/url";

/*
 * New-device sign-in emails. Each browser that signs in gets a random id in a signed cookie
 * (kept 400 days, the most browsers allow); its hash is stored per account in known_device. A
 * sign-in from a browser without a known id is a new device, unless an open session of the
 * account already has the same browser and IP address (a cleared cookie). The account's first
 * device is never one: a new account, or one that last signed in before this existed.
 * Sign-ins through an organization's SSO are recorded but not emailed (its identity provider
 * has its own alerts), nor are admin impersonations.
 */

const DEVICE_COOKIE = "known_device";
const DAY_SECONDS = 86_400;
const DEVICE_COOKIE_MAX_AGE = 400 * DAY_SECONDS;
/** Devices not seen for this long are forgotten by the cron route. */
export const KNOWN_DEVICE_RETENTION_DAYS = 400;
const DEVICE_ID = /^[A-Za-z0-9_-]{32,64}$/;
/** Shape of a "This wasn't me" token (and of a device id): 32 random bytes, base64url. */
export const SECURE_ACCOUNT_TOKEN = DEVICE_ID;
/** Prefix of the "This wasn't me" tokens in Better Auth's verification table. */
const SECURE_ACCOUNT_PREFIX = "secure-account:";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const randomToken = () => randomBytes(32).toString("base64url");

function emailedPath(path: string | undefined): boolean {
    return !path?.startsWith("/sso/") && !path?.startsWith("/admin/");
}

type SignedInSession = { id: string; userId: string; ipAddress?: string | null; userAgent?: string | null };

/**
 * Called once per sign-in that started a session (see database-hooks.ts and sign-in-plugins.ts).
 * Never throws: a failure here must not break the sign-in.
 */
export async function noticeSignIn(ctx: GenericEndpointContext | null | undefined, signedIn: SignedInSession): Promise<void> {
    if (!ctx?.headers) return;
    try {
        const cookie = ctx.context.createAuthCookie(DEVICE_COOKIE, { maxAge: DEVICE_COOKIE_MAX_AGE });
        const stored = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
        const deviceId = stored && DEVICE_ID.test(stored) ? stored : randomToken();
        const deviceHash = sha256(deviceId);
        const userAgent = (signedIn.userAgent ?? ctx.headers.get("user-agent"))?.slice(0, 512) ?? null;
        const ipAddress = signedIn.ipAddress ?? clientIp(ctx.headers);

        const devices = await db
            .select({ deviceHash: knownDevice.deviceHash })
            .from(knownDevice)
            .where(eq(knownDevice.userId, signedIn.userId));
        const firstDevice = devices.length === 0;
        let known = devices.some((d) => d.deviceHash === deviceHash);
        if (!known && !firstDevice && userAgent && ipAddress) {
            const [same] = await db
                .select({ id: sessionTable.id })
                .from(sessionTable)
                .where(
                    and(
                        eq(sessionTable.userId, signedIn.userId),
                        ne(sessionTable.id, signedIn.id),
                        eq(sessionTable.userAgent, userAgent),
                        eq(sessionTable.ipAddress, ipAddress),
                        gt(sessionTable.expiresAt, new Date()),
                    ),
                )
                .limit(1);
            known = Boolean(same);
        }

        const now = new Date();
        await db
            .insert(knownDevice)
            .values({ id: randomUUID(), userId: signedIn.userId, deviceHash, userAgent, ipAddress, createdAt: now, lastSeenAt: now })
            .onConflictDoUpdate({ target: [knownDevice.userId, knownDevice.deviceHash], set: { userAgent, ipAddress, lastSeenAt: now } });
        await ctx.setSignedCookie(cookie.name, deviceId, ctx.context.secret, cookie.attributes);
        await recordAccountEvent("sign_in", signedIn.userId, {
            ipAddress,
            userAgent,
            sessionId: signedIn.id,
            newDevice: !known && !firstDevice,
        });

        if (known || firstDevice || !emailedPath(ctx.path)) return;
        if (!(await currentAuthPolicy()).newDeviceEmail) return;
        const [account] = await db
            .select({ id: userTable.id, email: userTable.email })
            .from(userTable)
            .where(eq(userTable.id, signedIn.userId))
            .limit(1);
        if (!account) return;

        const token = await createSecureAccountToken(account.id);
        const locale = emailLocale(ctx.headers);
        const device = describeUserAgent(userAgent);
        queueNewDeviceEmail({
            email: account.email,
            url: `${env.AUTH_APP_URL ?? getBaseURL()}/${locale}/secure-account?token=${encodeURIComponent(token)}`,
            at: now,
            device,
            ipAddress,
            country: await requestCountry(ctx.headers),
            locale,
        });
        await recordAudit({
            actor: null,
            action: "user.new_device_sign_in",
            target: { type: "user", id: account.id, label: account.email },
            metadata: { browser: device.browser, system: device.system, path: ctx.path ?? null },
            ipAddress,
        });
    } catch (error) {
        console.error("new device check failed", error);
    }
}

async function createSecureAccountToken(userId: string): Promise<string> {
    const token = randomToken();
    const now = new Date();
    await db.insert(verification).values({
        id: randomUUID(),
        identifier: `${SECURE_ACCOUNT_PREFIX}${sha256(token)}`,
        value: userId,
        expiresAt: new Date(now.getTime() + SECURE_ACCOUNT_LINK_DAYS * DAY_SECONDS * 1000),
        createdAt: now,
        updatedAt: now,
    });
    return token;
}

/** Whether a "This wasn't me" token can still be used (the page shows its button only then). */
export async function secureAccountTokenValid(token: string): Promise<boolean> {
    const [row] = await db
        .select({ id: verification.id })
        .from(verification)
        .where(and(eq(verification.identifier, `${SECURE_ACCOUNT_PREFIX}${sha256(token)}`), gt(verification.expiresAt, new Date())))
        .limit(1);
    return Boolean(row);
}

/**
 * Uses up a "This wasn't me" token: returns the account it was sent to, or null when the token
 * is unknown, used or expired. Single use: the row is deleted as it is read.
 */
export async function consumeSecureAccountToken(token: string): Promise<{ id: string; email: string } | null> {
    const [row] = await db
        .delete(verification)
        .where(and(eq(verification.identifier, `${SECURE_ACCOUNT_PREFIX}${sha256(token)}`), gt(verification.expiresAt, new Date())))
        .returning({ userId: verification.value });
    if (!row) return null;
    const [account] = await db
        .select({ id: userTable.id, email: userTable.email })
        .from(userTable)
        .where(eq(userTable.id, row.userId))
        .limit(1);
    return account ?? null;
}

/** Signs the account out everywhere: every session is deleted. Returns how many there were. */
export async function signOutEverywhere(userId: string): Promise<number> {
    const deleted = await db.delete(sessionTable).where(eq(sessionTable.userId, userId)).returning({ id: sessionTable.id });
    return deleted.length;
}

/** Cron: forgets devices not seen for KNOWN_DEVICE_RETENTION_DAYS, and expired tokens. */
export async function purgeKnownDevices(now: Date = new Date()) {
    const deleted = await db
        .delete(knownDevice)
        .where(lt(knownDevice.lastSeenAt, new Date(now.getTime() - KNOWN_DEVICE_RETENTION_DAYS * DAY_SECONDS * 1000)))
        .returning({ id: knownDevice.id });
    await db.delete(verification).where(and(like(verification.identifier, `${SECURE_ACCOUNT_PREFIX}%`), lt(verification.expiresAt, now)));
    return deleted.length;
}
