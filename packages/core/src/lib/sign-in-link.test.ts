import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Sign-in links (the sign-in code email's button), against the real Better Auth configuration
 * and a real Postgres (PGlite): who gets one, where it resumes, and that it works once.
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


const sent = vi.hoisted(() => [] as { to: string; code: string; link?: string }[]);
vi.mock("@ostiary/core/lib/email/queue-sign-in-code-email", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    queueSignInCodeEmail: (input: (typeof sent)[number]) => sent.push(input),
}));

import * as dbModule from "@ostiary/core/db/index";
import * as schema from "@ostiary/core/db/schema";
import { createAuth } from "@ostiary/core/lib/auth-factory";
import { SIGN_IN_LINK_CALLBACK_HEADER, signInLinkEmail } from "@ostiary/core/lib/sign-in-link";

const { db } = dbModule;
const pglite = (dbModule as unknown as { client: PGlite }).client;

const BASE = "http://localhost:3000";
let auth: ReturnType<typeof createAuth>;
let seq = 0;

async function account() {
    const id = `usr_link_${++seq}`;
    const email = `link-${seq}@example.test`;
    const now = new Date();
    await db.insert(schema.user).values({ id, email, name: `user ${seq}`, emailVerified: true, createdAt: now, updatedAt: now });
    await db.insert(schema.account).values({ id: `acc_link_${seq}`, userId: id, providerId: "credential", accountId: id, password: await hashPassword("Pw-correct-horse-1"), createdAt: now, updatedAt: now });
    return { id, email };
}

async function askForCode(email: string, callback?: string) {
    const headers = new Headers({ "content-type": "application/json", origin: BASE, "x-real-ip": `198.51.100.${60 + seq}`, referer: `${BASE}/fr/login` });
    if (callback) headers.set(SIGN_IN_LINK_CALLBACK_HEADER, callback);
    const response = await auth.handler(new Request(`${BASE}/api/auth/email-otp/send-verification-otp`, { method: "POST", headers, body: JSON.stringify({ email, type: "sign-in" }) }));
    expect(response.status, await response.clone().text()).toBe(200);
}

async function verify(link: string) {
    const page = new URL(link);
    const query = new URLSearchParams({ token: page.searchParams.get("token")!, callbackURL: page.searchParams.get("callbackURL")!, errorCallbackURL: "/fr/sign-in-link" });
    return auth.handler(new Request(`${BASE}/api/auth/magic-link/verify?${query}`, { headers: new Headers({ "x-real-ip": "198.51.100.99" }) }));
}

beforeAll(async () => {
    await migrate(drizzle(pglite), { migrationsFolder: path.resolve(__dirname, "../db/migrations") });
    auth = createAuth({ baseURL: BASE, trustedOrigins: [BASE] });
    await auth.$context;
});

beforeEach(() => {
    sent.length = 0;
});

describe("sign-in links", () => {
    it("come with the code, resume the form's callback, sign in once", async () => {
        const who = await account();
        await askForCode(who.email, "/api/auth/oauth2/authorize?client_id=app&sig=abc");
        expect(sent).toHaveLength(1);
        const link = new URL(sent[0].link!);
        expect(link.pathname).toBe("/fr/sign-in-link");
        expect(link.searchParams.get("callbackURL")).toBe("/api/auth/oauth2/authorize?client_id=app&sig=abc");
        expect(await signInLinkEmail(link.searchParams.get("token")!)).toBe(who.email);

        const first = await verify(link.toString());
        expect(first.status).toBe(302);
        expect(first.headers.get("location")).toBe(`${BASE}/api/auth/oauth2/authorize?client_id=app&sig=abc`);
        expect(first.headers.getSetCookie().some((c) => c.includes("session_token="))).toBe(true);
        expect(await signInLinkEmail(link.searchParams.get("token")!)).toBeNull();

        const again = await verify(link.toString());
        expect(again.headers.get("location")).toContain("/fr/sign-in-link?error=INVALID_TOKEN");
    });

    it("go to the account page when the callback is missing or off-site", async () => {
        const who = await account();
        await askForCode(who.email, "https://evil.example/steal");
        expect(new URL(sent[0].link!).searchParams.get("callbackURL")).toBe("/fr/dashboard");
    });

    it("are not sent for an unknown address (nor is a code)", async () => {
        await askForCode("nobody@example.test");
        expect(sent).toEqual([]);
    });
});
