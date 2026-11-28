import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Password sign-in lockout against the real Better Auth configuration (createAuth) and a real
 * Postgres (PGlite): wrong passwords for one email lock it, whatever the IP address.
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

import * as dbModule from "@ostiary/core/db/index";
import * as schema from "@ostiary/core/db/schema";
import { createAuth } from "@ostiary/core/lib/auth-factory";
import { saveAuthPolicy, DEFAULT_AUTH_POLICY } from "@ostiary/core/lib/auth-policy";
import { LOCKOUT_MINUTES } from "@ostiary/core/lib/auth-policy-options";
import { lockoutState } from "@ostiary/core/lib/security/sign-in-lockout";

const { db } = dbModule;
const pglite = (dbModule as unknown as { client: PGlite }).client;

const BASE = "http://localhost:3000";
let auth: ReturnType<typeof createAuth>;
let seq = 0;
let ip = 0;

async function account() {
    const id = `usr_lock_${++seq}`;
    const email = `lock-${seq}@example.test`;
    const password = `Pw-${seq}-correct-horse-battery`;
    const now = new Date();
    await db.insert(schema.user).values({ id, email, name: `user ${seq}`, emailVerified: true, createdAt: now, updatedAt: now });
    await db.insert(schema.account).values({
        id: `acc_lock_${seq}`,
        userId: id,
        providerId: "credential",
        accountId: id,
        password: await hashPassword(password),
        createdAt: now,
        updatedAt: now,
    });
    return { id, email, password };
}

/** A password sign-in from a new IP address each time (rate limits are per IP). */
async function signIn(email: string, password: string) {
    const headers = new Headers({ "content-type": "application/json", origin: BASE, "x-real-ip": `198.51.100.${(++ip % 250) + 1}` });
    return auth.handler(new Request(`${BASE}/api/auth/sign-in/email`, { method: "POST", headers, body: JSON.stringify({ email, password }) }));
}

async function wrong(email: string, times: number) {
    for (let i = 0; i < times; i++) expect((await signIn(email, `wrong-password-${i}`)).status).toBe(401);
}

beforeAll(async () => {
    await migrate(drizzle(pglite), { migrationsFolder: path.resolve(__dirname, "../../db/migrations") });
    auth = createAuth({ baseURL: BASE, trustedOrigins: [BASE] });
    await auth.$context;
});

beforeEach(async () => {
    await saveAuthPolicy({ ...DEFAULT_AUTH_POLICY, lockoutAttempts: 5 }, null);
});

describe("password sign-in lockout", () => {
    it("refuses even the right password once enough wrong ones came from different addresses", async () => {
        const who = await account();
        await wrong(who.email, 5);
        const locked = await signIn(who.email, who.password);
        expect(locked.status).toBe(429);
        const body = await locked.json();
        expect(body.code).toBe("RATE_LIMITED");
        expect(body.retryAfter).toBeGreaterThan(LOCKOUT_MINUTES * 60 - 30);
        expect(Number(locked.headers.get("retry-after"))).toBe(body.retryAfter);

        // Refusals are not counted; the lock is in the history and the audit log once.
        expect((await signIn(who.email, "wrong-again")).status).toBe(429);
        const failures = await db.select().from(schema.authEvent).where(and(eq(schema.authEvent.type, "sign_in_failed"), eq(schema.authEvent.identifier, who.email)));
        expect(failures).toHaveLength(5);
        const events = await db.select().from(schema.accountEvent).where(and(eq(schema.accountEvent.userId, who.id), eq(schema.accountEvent.type, "sign_in_locked")));
        expect(events).toHaveLength(1);
        const audits = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.action, "user.sign_in_locked"), eq(schema.auditLog.targetId, who.id)));
        expect(audits).toHaveLength(1);
    });

    it("ends after the window", async () => {
        const who = await account();
        await wrong(who.email, 5);
        expect((await lockoutState(who.email, 5)).locked).toBe(true);
        const later = new Date(Date.now() + (LOCKOUT_MINUTES + 1) * 60_000);
        expect((await lockoutState(who.email, 5, later)).locked).toBe(false);
    });

    it("answers the same for an email without an account", async () => {
        await wrong("nobody-here@example.test", 5);
        const response = await signIn("Nobody-Here@example.test", "anything-at-all");
        expect(response.status).toBe(429);
        expect((await response.json()).code).toBe("RATE_LIMITED");
    });

    it("starts the count again after a successful sign-in", async () => {
        const who = await account();
        await wrong(who.email, 4);
        expect((await signIn(who.email, who.password)).status).toBe(200);
        await wrong(who.email, 4);
        expect((await signIn(who.email, who.password)).status).toBe(200);
    });

    it("never locks when the admin console turned it off", async () => {
        await saveAuthPolicy({ ...DEFAULT_AUTH_POLICY, lockoutAttempts: 0 }, null);
        const who = await account();
        await wrong(who.email, 6);
        expect((await signIn(who.email, who.password)).status).toBe(200);
    });
});
