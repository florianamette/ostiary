import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The breached-password check at sign-in, against the real Better Auth configuration and a real
 * Postgres (PGlite), with a fake Have I Been Pwned lookup.
 */

vi.hoisted(() => {
    process.env.REQUIRE_ADMIN_2FA = "false";
    process.env.IP_ADDRESS_HEADERS = "x-real-ip";
    process.env.PASSWORD_BREACH_CHECK = "on";
});

vi.mock("@ostiary/core/db/index", async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const schema = await import("@ostiary/core/db/schema");
    const client = new PGlite();
    return { db: drizzle(client, { schema }), client };
});


const breachedPasswords = vi.hoisted(() => new Set<string>());
vi.mock("better-auth/plugins", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    isPasswordCompromised: async (password: string) => breachedPasswords.has(password),
}));

import * as dbModule from "@ostiary/core/db/index";
import * as schema from "@ostiary/core/db/schema";
import { createAuth } from "@ostiary/core/lib/auth-factory";
import { passwordBreachPending } from "@ostiary/core/lib/security/password-breach";

const { db } = dbModule;
const pglite = (dbModule as unknown as { client: PGlite }).client;

const BASE = "http://localhost:3000";
let auth: ReturnType<typeof createAuth>;
let seq = 0;

async function account(password: string) {
    const id = `usr_br_${++seq}`;
    const email = `breach-${seq}@example.test`;
    const now = new Date();
    await db.insert(schema.user).values({ id, email, name: `user ${seq}`, emailVerified: true, createdAt: now, updatedAt: now });
    await db.insert(schema.account).values({
        id: `acc_br_${seq}`,
        userId: id,
        providerId: "credential",
        accountId: id,
        password: await hashPassword(password),
        createdAt: now,
        updatedAt: now,
    });
    return { id, email, password };
}

async function call(path: string, body: unknown, cookie?: string) {
    const headers = new Headers({ "content-type": "application/json", origin: BASE, "x-real-ip": "198.51.100.40" });
    if (cookie) headers.set("cookie", cookie);
    const response = await auth.handler(new Request(`${BASE}/api/auth${path}`, { method: "POST", headers, body: JSON.stringify(body) }));
    return { status: response.status, cookie: response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") };
}

beforeAll(async () => {
    await migrate(drizzle(pglite), { migrationsFolder: path.resolve(__dirname, "../../db/migrations") });
    auth = createAuth({ baseURL: BASE, trustedOrigins: [BASE] });
    await auth.$context;
});

beforeEach(() => breachedPasswords.clear());

describe("breached password at sign-in", () => {
    it("is recorded, audited, and cleared by a password change", async () => {
        const who = await account("Leaked-password-0001");
        breachedPasswords.add(who.password);
        const signIn = await call("/sign-in/email", { email: who.email, password: who.password });
        expect(signIn.status).toBe(200);
        expect(await passwordBreachPending(who.id)).toBe(true);
        const [audit] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "user.password_breached"));
        expect(audit?.targetId).toBe(who.id);
        const events = await db.select().from(schema.accountEvent).where(eq(schema.accountEvent.userId, who.id));
        expect(events.map((e) => e.type).sort()).toEqual(["password_breached", "sign_in"]);

        const changed = await call("/change-password", { currentPassword: who.password, newPassword: "A-new-strong-password-0002", revokeOtherSessions: true }, signIn.cookie);
        expect(changed.status).toBe(200);
        expect(await passwordBreachPending(who.id)).toBe(false);
    });

    it("is not recorded for a password not in a breach, nor for a failed sign-in", async () => {
        const who = await account("Fine-password-0003");
        expect((await call("/sign-in/email", { email: who.email, password: who.password })).status).toBe(200);
        breachedPasswords.add("Wrong-but-breached-0004");
        expect((await call("/sign-in/email", { email: who.email, password: "Wrong-but-breached-0004" })).status).toBe(401);
        expect(await passwordBreachPending(who.id)).toBe(false);
    });

    it("never blocks the sign-in when the lookup fails", async () => {
        const who = await account("Any-password-0005");
        const failing = vi.spyOn(breachedPasswords, "has").mockImplementation(() => {
            throw new Error("network down");
        });
        expect((await call("/sign-in/email", { email: who.email, password: who.password })).status).toBe(200);
        expect(await passwordBreachPending(who.id)).toBe(false);
        failing.mockRestore();
    });
});
