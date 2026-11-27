import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * New-device sign-in emails against the real Better Auth configuration (createAuth) and a real
 * Postgres (PGlite, every migration applied): which sign-ins send one, and the "This wasn't
 * me" token.
 */

vi.hoisted(() => {
    process.env.REQUIRE_ADMIN_2FA = "false";
    process.env.IP_ADDRESS_HEADERS = "x-real-ip";
});

vi.mock("@ostiary/core/db/index", async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const schema = await import("@ostiary/core/db/schema");
    const client = new PGlite();
    return { db: drizzle(client, { schema }), client };
});

const sent = vi.hoisted(() => [] as { email: string; url: string; device: { browser: string | null; system: string | null } }[]);
vi.mock("@ostiary/core/lib/email/queue-new-device-email", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    queueNewDeviceEmail: (input: (typeof sent)[number]) => sent.push(input),
}));

import * as dbModule from "@ostiary/core/db/index";
import * as schema from "@ostiary/core/db/schema";
import { createAuth } from "@ostiary/core/lib/auth-factory";
import { saveAuthPolicy, DEFAULT_AUTH_POLICY } from "@ostiary/core/lib/auth-policy";
import { consumeSecureAccountToken, secureAccountTokenValid, signOutEverywhere } from "@ostiary/core/lib/security/new-device";

const { db } = dbModule;
const pglite = (dbModule as unknown as { client: PGlite }).client;

const BASE = "http://localhost:3000";
const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0";
let auth: ReturnType<typeof createAuth>;
let seq = 0;

async function account() {
    const id = `usr_dev_${++seq}`;
    const email = `device-${seq}@example.test`;
    const password = `Pw-${seq}-correct-horse-battery`;
    const now = new Date();
    await db.insert(schema.user).values({ id, email, name: `user ${seq}`, emailVerified: true, createdAt: now, updatedAt: now });
    await db.insert(schema.account).values({
        id: `acc_dev_${seq}`,
        userId: id,
        providerId: "credential",
        accountId: id,
        password: await hashPassword(password),
        createdAt: now,
        updatedAt: now,
    });
    return { id, email, password };
}

/** Signs in through the HTTP handler, as a browser with `cookie` (the device cookie, if any). */
async function signIn(who: { email: string; password: string }, browser: { ua: string; ip: string; cookie?: string }) {
    const headers = new Headers({
        "content-type": "application/json",
        origin: BASE,
        "user-agent": browser.ua,
        "x-real-ip": browser.ip,
    });
    if (browser.cookie) headers.set("cookie", browser.cookie);
    const response = await auth.handler(
        new Request(`${BASE}/api/auth/sign-in/email`, { method: "POST", headers, body: JSON.stringify({ email: who.email, password: who.password }) }),
    );
    expect(response.status, await response.clone().text()).toBe(200);
    const device = response.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .find((c) => c.split("=")[0].endsWith("known_device"));
    return { device };
}

beforeAll(async () => {
    await migrate(drizzle(pglite), { migrationsFolder: path.resolve(__dirname, "../../db/migrations") });
    auth = createAuth({ baseURL: BASE, trustedOrigins: [BASE] });
    await auth.$context;
});

beforeEach(async () => {
    sent.length = 0;
    await saveAuthPolicy(DEFAULT_AUTH_POLICY, null);
});

describe("new-device sign-in email", () => {
    it("is not sent for the account's first device, nor again from a known one", async () => {
        const who = await account();
        const first = await signIn(who, { ua: CHROME_MAC, ip: "198.51.100.1" });
        expect(first.device).toBeTruthy();
        await signIn(who, { ua: CHROME_MAC, ip: "198.51.100.77", cookie: first.device });
        expect(sent).toEqual([]);
        const rows = await db.select().from(schema.knownDevice).where(eq(schema.knownDevice.userId, who.id));
        expect(rows).toHaveLength(1);
        expect(rows[0].ipAddress).toBe("198.51.100.77");
    });

    it("is sent for another browser, with a link that works once", async () => {
        const who = await account();
        await signIn(who, { ua: CHROME_MAC, ip: "198.51.100.2" });
        await signIn(who, { ua: FIREFOX_LINUX, ip: "203.0.113.9" });
        expect(sent).toHaveLength(1);
        expect(sent[0].email).toBe(who.email);
        expect(sent[0].device).toEqual({ browser: "Firefox", system: "Linux" });
        const token = new URL(sent[0].url).searchParams.get("token")!;
        expect(new URL(sent[0].url).pathname).toBe("/en/secure-account");

        const [audit] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "user.new_device_sign_in"));
        expect(audit?.targetId).toBe(who.id);

        expect(await secureAccountTokenValid(token)).toBe(true);
        expect(await consumeSecureAccountToken(token)).toEqual({ id: who.id, email: who.email });
        expect(await consumeSecureAccountToken(token)).toBeNull();
        expect(await secureAccountTokenValid(token)).toBe(false);

        expect(await signOutEverywhere(who.id)).toBe(2);
        expect(await db.select().from(schema.session).where(eq(schema.session.userId, who.id))).toEqual([]);
    });

    it("is not sent when an open session has the same browser and IP address (cleared cookie)", async () => {
        const who = await account();
        await signIn(who, { ua: CHROME_MAC, ip: "198.51.100.3" });
        await signIn(who, { ua: CHROME_MAC, ip: "198.51.100.3" });
        expect(sent).toEqual([]);
    });

    it("is not sent when the policy turns it off", async () => {
        await saveAuthPolicy({ ...DEFAULT_AUTH_POLICY, newDeviceEmail: false }, null);
        const who = await account();
        await signIn(who, { ua: CHROME_MAC, ip: "198.51.100.4" });
        await signIn(who, { ua: FIREFOX_LINUX, ip: "203.0.113.10" });
        expect(sent).toEqual([]);
        // Still recorded, so turning it on later does not email about known browsers.
        expect(await db.select().from(schema.knownDevice).where(eq(schema.knownDevice.userId, who.id))).toHaveLength(2);
    });

    it("ignores a forged device cookie", async () => {
        const who = await account();
        await signIn(who, { ua: CHROME_MAC, ip: "198.51.100.5" });
        await signIn(who, { ua: FIREFOX_LINUX, ip: "203.0.113.11", cookie: "better-auth.known_device=forged-value-that-is-not-signed-0000000000" });
        expect(sent).toHaveLength(1);
    });
});
