import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";

/*
 * "Recent activity" against the real Better Auth configuration (createAuth) and a real Postgres
 * (PGlite, every migration applied): what is recorded, and the page the account page reads.
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
import { listAccountActivity, purgeAccountEvents, recordAccountEvent, signOutOwnSession } from "@ostiary/core/lib/account-activity";
import { userUpdateEvents } from "@ostiary/core/lib/auth-hooks/account-activity-hook";

const { db } = dbModule;
const pglite = (dbModule as unknown as { client: PGlite }).client;

const BASE = "http://localhost:3000";
const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0";
let auth: ReturnType<typeof createAuth>;
let seq = 0;

async function account() {
    const id = `usr_act_${++seq}`;
    const email = `activity-${seq}@example.test`;
    const password = `Pw-${seq}-correct-horse-battery`;
    const now = new Date();
    await db.insert(schema.user).values({ id, email, name: `user ${seq}`, emailVerified: true, createdAt: now, updatedAt: now });
    await db.insert(schema.account).values({
        id: `acc_act_${seq}`,
        userId: id,
        providerId: "credential",
        accountId: id,
        password: await hashPassword(password),
        createdAt: now,
        updatedAt: now,
    });
    return { id, email, password };
}

async function call(path: string, body: unknown, cookie?: string, ip = "198.51.100.20") {
    const headers = new Headers({ "content-type": "application/json", origin: BASE, "user-agent": FIREFOX, "x-real-ip": ip });
    if (cookie) headers.set("cookie", cookie);
    const response = await auth.handler(new Request(`${BASE}/api/auth${path}`, { method: "POST", headers, body: JSON.stringify(body) }));
    expect(response.status, await response.clone().text()).toBe(200);
    const cookies = response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    return { cookie: cookies, json: (await response.json()) as Record<string, unknown> };
}

beforeAll(async () => {
    await migrate(drizzle(pglite), { migrationsFolder: path.resolve(__dirname, "../db/migrations") });
    auth = createAuth({ baseURL: BASE, trustedOrigins: [BASE] });
    await auth.$context;
});

describe("account activity", () => {
    it("records sign-ins with their session, and password and session changes", async () => {
        const who = await account();
        const first = await call("/sign-in/email", { email: who.email, password: who.password });
        const second = await call("/sign-in/email", { email: who.email, password: who.password }, undefined, "203.0.113.30");
        await call("/change-password", { currentPassword: who.password, newPassword: `${who.password}-new` }, second.cookie);
        await call("/revoke-other-sessions", {}, second.cookie);

        const sessions = await db.select().from(schema.session).where(eq(schema.session.userId, who.id));
        expect(sessions).toHaveLength(1);
        const page = await listAccountActivity(who.id, { currentSessionId: sessions[0].id });
        expect(page.items.map((i) => i.type)).toEqual(["sessions_revoked", "password_changed", "sign_in", "sign_in"]);
        const [latestSignIn, firstSignIn] = page.items.filter((i) => i.type === "sign_in");
        expect(latestSignIn).toMatchObject({ ipAddress: "203.0.113.30", userAgent: FIREFOX, current: true, openSessionId: sessions[0].id });
        // The first sign-in's session was signed out with the others.
        expect(firstSignIn).toMatchObject({ openSessionId: null, current: false, newDevice: false });
        expect(first.cookie).toBeTruthy();
    });

    it("pages back through the last 30 days only", async () => {
        const who = await account();
        const now = Date.now();
        await db.insert(schema.accountEvent).values([
            ...Array.from({ length: 25 }, (_, i) => ({ id: `ev_${who.id}_${i}`, userId: who.id, type: "password_changed", createdAt: new Date(now - i * 60_000) })),
            { id: `ev_${who.id}_old`, userId: who.id, type: "password_changed", createdAt: new Date(now - 31 * 86_400_000) },
            { id: `ev_${who.id}_unknown`, userId: who.id, type: "something_else", createdAt: new Date(now) },
        ]);
        const first = await listAccountActivity(who.id);
        expect(first.items).toHaveLength(20);
        expect(first.next).toBeTruthy();
        const second = await listAccountActivity(who.id, { before: first.next });
        expect(second.items).toHaveLength(5);
        expect(second.next).toBeNull();
    });

    it("signs out only the person's own session", async () => {
        const who = await account();
        const other = await account();
        await call("/sign-in/email", { email: who.email, password: who.password });
        const [own] = await db.select().from(schema.session).where(eq(schema.session.userId, who.id));
        expect(await signOutOwnSession(other.id, own.id)).toBe(false);
        expect(await signOutOwnSession(who.id, own.id)).toBe(true);
    });

    it("purges after the retention", async () => {
        const who = await account();
        await recordAccountEvent("password_changed", who.id);
        expect(await purgeAccountEvents(new Date(Date.now() + 91 * 86_400_000), 90)).toBeGreaterThan(0);
    });
});

describe("userUpdateEvents", () => {
    it("names email and two-factor changes, not admin ones or a plain verification", () => {
        expect(userUpdateEvents({ email: "new@example.test" }, "/verify-email")).toEqual(["email_changed"]);
        expect(userUpdateEvents({ emailVerified: true } as never, "/verify-email")).toEqual([]);
        expect(userUpdateEvents({ twoFactorEnabled: true }, "/two-factor/verify-totp")).toEqual(["two_factor_enabled"]);
        expect(userUpdateEvents({ twoFactorEnabled: false }, "/two-factor/disable")).toEqual(["two_factor_disabled"]);
        expect(userUpdateEvents({ twoFactorEnabled: false }, "/admin/update-user")).toEqual([]);
        expect(userUpdateEvents({ twoFactorEnabled: true }, undefined)).toEqual([]);
    });
});
