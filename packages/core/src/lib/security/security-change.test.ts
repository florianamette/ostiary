import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Security-change emails against the real Better Auth configuration (createAuth) and a real
 * Postgres (PGlite): a password change or reset emails the account, with a "This wasn't me"
 * link, unless the admin console turned the emails off.
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

type Sent = { change: string; email: string; url: string; ipAddress: string | null; device: { browser: string | null; system: string | null } };
const sent = vi.hoisted(() => [] as Sent[]);
vi.mock("@ostiary/core/lib/email/queue-security-change-email", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    queueSecurityChangeEmail: (input: Sent) => sent.push(input),
}));
const resets = vi.hoisted(() => [] as { to: string; url: string }[]);
vi.mock("@ostiary/core/lib/email/queue-password-reset-email", () => ({
    queuePasswordResetEmail: (input: { to: string; url: string }) => resets.push(input),
}));

import * as dbModule from "@ostiary/core/db/index";
import * as schema from "@ostiary/core/db/schema";
import { createAuth } from "@ostiary/core/lib/auth-factory";
import { saveAuthPolicy, DEFAULT_AUTH_POLICY } from "@ostiary/core/lib/auth-policy";
import { secureAccountTokenValid } from "@ostiary/core/lib/security/new-device";

const { db } = dbModule;
const pglite = (dbModule as unknown as { client: PGlite }).client;

const BASE = "http://localhost:3000";
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0";
let auth: ReturnType<typeof createAuth>;
let seq = 0;

async function account() {
    const id = `usr_sc_${++seq}`;
    const email = `change-${seq}@example.test`;
    const password = `Pw-${seq}-correct-horse-battery`;
    const now = new Date();
    await db.insert(schema.user).values({ id, email, name: `user ${seq}`, emailVerified: true, createdAt: now, updatedAt: now });
    await db.insert(schema.account).values({
        id: `acc_sc_${seq}`,
        userId: id,
        providerId: "credential",
        accountId: id,
        password: await hashPassword(password),
        createdAt: now,
        updatedAt: now,
    });
    return { id, email, password };
}

function headers(cookie?: string) {
    const h = new Headers({ "content-type": "application/json", origin: BASE, "user-agent": FIREFOX_LINUX, "x-real-ip": "203.0.113.9" });
    if (cookie) h.set("cookie", cookie);
    return h;
}

async function call(endpoint: string, body: unknown, cookie?: string) {
    return auth.handler(new Request(`${BASE}/api/auth${endpoint}`, { method: "POST", headers: headers(cookie), body: JSON.stringify(body) }));
}

async function signIn(who: { email: string; password: string }) {
    const response = await call("/sign-in/email", { email: who.email, password: who.password });
    expect(response.status, await response.clone().text()).toBe(200);
    return response.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
}

beforeAll(async () => {
    await migrate(drizzle(pglite), { migrationsFolder: path.resolve(__dirname, "../../db/migrations") });
    auth = createAuth({ baseURL: BASE, trustedOrigins: [BASE] });
    await auth.$context;
});

beforeEach(async () => {
    sent.length = 0;
    resets.length = 0;
    await saveAuthPolicy(DEFAULT_AUTH_POLICY, null);
});

describe("security-change emails", () => {
    it("are sent for a password change, with the device and a working link", async () => {
        const who = await account();
        const cookie = await signIn(who);
        const response = await call("/change-password", { currentPassword: who.password, newPassword: "A-new-strong-password-0001" }, cookie);
        expect(response.status, await response.clone().text()).toBe(200);
        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({ change: "password_changed", email: who.email, ipAddress: "203.0.113.9" });
        expect(sent[0].device).toEqual({ browser: "Firefox", system: "Linux" });
        const url = new URL(sent[0].url);
        expect(url.pathname).toBe("/en/secure-account");
        expect(await secureAccountTokenValid(url.searchParams.get("token")!)).toBe(true);

        const events = await db.select().from(schema.accountEvent).where(eq(schema.accountEvent.userId, who.id));
        expect(events.map((e) => e.type)).toContain("password_changed");
    });

    it("are sent for a password reset", async () => {
        const who = await account();
        const requested = await call("/request-password-reset", { email: who.email, redirectTo: `${BASE}/en/reset-password` });
        expect(requested.status).toBe(200);
        await vi.waitFor(() => expect(resets).toHaveLength(1));
        const token = new URL(resets[0].url).pathname.split("/").pop()!;
        const reset = await call("/reset-password", { token, newPassword: "A-new-strong-password-0002" });
        expect(reset.status, await reset.clone().text()).toBe(200);
        expect(sent.map((s) => s.change)).toEqual(["password_reset"]);
    });

    it("are not sent when the admin console turned them off; the history still is", async () => {
        await saveAuthPolicy({ ...DEFAULT_AUTH_POLICY, securityChangeEmail: false }, null);
        const who = await account();
        const cookie = await signIn(who);
        const response = await call("/change-password", { currentPassword: who.password, newPassword: "A-new-strong-password-0003" }, cookie);
        expect(response.status).toBe(200);
        expect(sent).toEqual([]);
        const events = await db.select().from(schema.accountEvent).where(eq(schema.accountEvent.userId, who.id));
        expect(events.map((e) => e.type)).toContain("password_changed");
    });
});
