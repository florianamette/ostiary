import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The country policy against the real Better Auth configuration and a real Postgres (PGlite),
 * the country read from COUNTRY_HEADER. Sign-up (refused inside its transaction, which PGlite's
 * single connection cannot share) is covered end to end: e2e/tests/countries.platform.spec.ts.
 */

vi.hoisted(() => {
    process.env.REQUIRE_ADMIN_2FA = "false";
    process.env.IP_ADDRESS_HEADERS = "x-real-ip";
    process.env.COUNTRY_HEADER = "x-country";
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
import { DEFAULT_COUNTRY_POLICY, saveCountryPolicy } from "@ostiary/core/lib/country-policy";
import { requestCountry } from "@ostiary/core/lib/country";

const { db } = dbModule;
const pglite = (dbModule as unknown as { client: PGlite }).client;

const BASE = "http://localhost:3000";
const PASSWORD = "Pw-correct-horse-battery-1";
let auth: ReturnType<typeof createAuth>;
let seq = 0;

async function account(role?: string) {
    const id = `usr_cty_${++seq}`;
    const email = `country-${seq}@example.test`;
    const now = new Date();
    await db.insert(schema.user).values({ id, email, name: `user ${seq}`, emailVerified: true, role, createdAt: now, updatedAt: now });
    await db.insert(schema.account).values({ id: `acc_cty_${seq}`, userId: id, providerId: "credential", accountId: id, password: await hashPassword(PASSWORD), createdAt: now, updatedAt: now });
    return { id, email };
}

async function post(path: string, body: unknown, country?: string) {
    const headers = new Headers({ "content-type": "application/json", origin: BASE, "x-real-ip": `198.51.100.${100 + seq}` });
    if (country) headers.set("x-country", country);
    const response = await auth.handler(new Request(`${BASE}/api/auth${path}`, { method: "POST", headers, body: JSON.stringify(body) }));
    return { status: response.status, body: (await response.json().catch(() => null)) as { code?: string } | null };
}

beforeAll(async () => {
    await migrate(drizzle(pglite), { migrationsFolder: path.resolve(__dirname, "../db/migrations") });
    auth = createAuth({ baseURL: BASE, trustedOrigins: [BASE] });
    await auth.$context;
});

beforeEach(async () => {
    await saveCountryPolicy({ mode: "block", countries: ["FR"] }, null);
});

describe("country policy", () => {
    it("reads the country header, ignoring unknown codes", async () => {
        expect(await requestCountry(new Headers({ "x-country": "fr" }))).toBe("FR");
        expect(await requestCountry(new Headers({ "x-country": "XX" }))).toBeNull();
        expect(await requestCountry(new Headers())).toBeNull();
    });

    it("refuses a sign-in from a blocked country, and audits it", async () => {
        const who = await account();
        const refused = await post("/sign-in/email", { email: who.email, password: PASSWORD }, "FR");
        expect(refused.status).toBe(400);
        expect(refused.body?.code).toBe("COUNTRY_NOT_ALLOWED");
        expect(await db.select().from(schema.session).where(eq(schema.session.userId, who.id))).toEqual([]);
        const audits = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "security.country_refused"));
        expect(audits.some((a) => a.targetId === who.id && (a.metadata as { country?: string }).country === "FR")).toBe(true);

        expect((await post("/sign-in/email", { email: who.email, password: PASSWORD }, "DE")).status).toBe(200);
        // Unknown country: allowed.
        expect((await post("/sign-in/email", { email: who.email, password: PASSWORD })).status).toBe(200);
    });

    it("never refuses a platform admin", async () => {
        const admin = await account("admin");
        expect((await post("/sign-in/email", { email: admin.email, password: PASSWORD }, "FR")).status).toBe(200);
    });

    it("does nothing with the policy off", async () => {
        await saveCountryPolicy(DEFAULT_COUNTRY_POLICY, null);
        const who = await account();
        expect((await post("/sign-in/email", { email: who.email, password: PASSWORD }, "FR")).status).toBe(200);
    });
});
