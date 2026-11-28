import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The inactive account rule against the real Better Auth configuration (its internal adapter,
 * hooks included) and a real Postgres (PGlite, every migration applied).
 */

vi.hoisted(() => {
    process.env.REQUIRE_ADMIN_2FA = "false";
});

vi.mock("@ostiary/core/db/index", async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const schema = await import("@ostiary/core/db/schema");
    const client = new PGlite();
    return { db: drizzle(client, { schema }), client };
});

const emails = vi.hoisted(() => [] as { email: string; action: string; on: Date; url: string; locale: string }[]);
vi.mock("@ostiary/core/lib/email/queue-inactive-account-email", () => ({
    queueInactiveAccountEmail: (input: (typeof emails)[number]) => emails.push(input),
}));

import * as dbModule from "@ostiary/core/db/index";
import * as schema from "@ostiary/core/db/schema";
import { writeAppSetting } from "@ostiary/core/lib/app-settings";
import { createAuth } from "@ostiary/core/lib/auth-factory";
import { DEFAULT_AUTH_POLICY } from "@ostiary/core/lib/auth-policy-options";
import { userUpdateEvents } from "@ostiary/core/lib/webhooks/events";
import { INACTIVE_REASON, noteSignIn, sweepInactiveAccounts, type InactiveAccountsContext } from "@ostiary/core/lib/security/inactive-accounts";

const { db } = dbModule;
const pglite = (dbModule as unknown as { client: PGlite }).client;

const DAY = 86_400_000;
const NOW = new Date("2027-06-01T00:00:00Z");
let ctx: InactiveAccountsContext;
let seq = 0;

async function account(options: { createdDaysAgo: number; role?: string }) {
    const id = `usr_inactive_${++seq}`;
    const created = new Date(NOW.getTime() - options.createdDaysAgo * DAY);
    await db.insert(schema.user).values({
        id,
        email: `${id}@example.test`,
        name: `user ${seq}`,
        emailVerified: true,
        role: options.role ?? "user",
        createdAt: created,
        updatedAt: created,
    });
    return id;
}

async function policy(days: number, action: "disable" | "delete", sinceDaysAgo = 400) {
    await writeAppSetting(
        "auth_policy",
        { ...DEFAULT_AUTH_POLICY, inactiveDays: days, inactiveAction: action, inactiveSince: new Date(NOW.getTime() - sinceDaysAgo * DAY).toISOString() },
        null,
    );
}

async function userRow(id: string) {
    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, id));
    return row;
}

beforeAll(async () => {
    await migrate(drizzle(pglite), { migrationsFolder: path.resolve(__dirname, "../../db/migrations") });
    const auth = createAuth({ baseURL: "http://localhost:3000", trustedOrigins: ["http://localhost:3000"] });
    ctx = (await auth.$context) as unknown as InactiveAccountsContext;
});

beforeEach(async () => {
    emails.length = 0;
    await db.delete(schema.user);
});

describe("inactive accounts", () => {
    it("does nothing while the rule is off", async () => {
        await writeAppSetting("auth_policy", DEFAULT_AUTH_POLICY, null);
        await account({ createdDaysAgo: 1000 });
        expect(await sweepInactiveAccounts(ctx, NOW)).toEqual({ warned: 0, disabled: 0, deleted: 0 });
    });

    it("warns first, then disables at least the warning period later", async () => {
        await policy(180, "disable");
        const idle = await account({ createdDaysAgo: 500 });
        const active = await account({ createdDaysAgo: 500 });
        await noteSignIn(active, null, new Date(NOW.getTime() - 10 * DAY));
        const admin = await account({ createdDaysAgo: 500, role: "admin" });
        await db.insert(schema.session).values({
            id: "sess_idle",
            userId: idle,
            token: "tok_idle",
            expiresAt: new Date(NOW.getTime() + DAY),
            createdAt: new Date(NOW.getTime() - 300 * DAY),
            updatedAt: new Date(NOW.getTime() - 300 * DAY),
        });

        expect(await sweepInactiveAccounts(ctx, NOW)).toEqual({ warned: 1, disabled: 0, deleted: 0 });
        expect(emails).toEqual([expect.objectContaining({ email: `${idle}@example.test`, action: "disable", url: "http://localhost:3000/en/login" })]);
        // Overdue already: the person still gets the full notice.
        expect(emails[0]!.on.getTime()).toBe(NOW.getTime() + 14 * DAY);

        // Not again the next day, and not acted on before the notice ends.
        expect(await sweepInactiveAccounts(ctx, new Date(NOW.getTime() + DAY))).toEqual({ warned: 0, disabled: 0, deleted: 0 });
        expect(await sweepInactiveAccounts(ctx, new Date(NOW.getTime() + 14 * DAY))).toEqual({ warned: 0, disabled: 1, deleted: 0 });

        expect(await userRow(idle)).toMatchObject({ banned: true, banReason: INACTIVE_REASON });
        expect(await db.select().from(schema.session).where(eq(schema.session.userId, idle))).toHaveLength(0);
        expect(userUpdateEvents({ banned: false }, { id: idle, banned: true, banReason: INACTIVE_REASON })[0]?.data.source).toBe("inactivity");
        expect((await userRow(active))?.banned).toBeFalsy();
        expect((await userRow(admin))?.banned).toBeFalsy();
        const [audit] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "user.inactive_disabled"));
        expect(audit).toMatchObject({ targetId: idle, targetLabel: `${idle}@example.test` });
    });

    it("counts from when the rule was turned on, and a sign-in after the warning keeps the account", async () => {
        await policy(180, "delete", 170);
        const id = await account({ createdDaysAgo: 1000 });
        expect(await sweepInactiveAccounts(ctx, NOW)).toEqual({ warned: 1, disabled: 0, deleted: 0 });
        expect(emails[0]!.on.getTime()).toBe(NOW.getTime() + 14 * DAY);

        await noteSignIn(id, null, new Date(NOW.getTime() + 2 * DAY));
        expect(await sweepInactiveAccounts(ctx, new Date(NOW.getTime() + 20 * DAY))).toEqual({ warned: 0, disabled: 0, deleted: 0 });
        expect(await userRow(id)).toBeDefined();
    });

    it("deletes when asked to, with the account's data", async () => {
        await policy(365, "delete");
        const id = await account({ createdDaysAgo: 800 });
        await sweepInactiveAccounts(ctx, NOW);
        expect(await sweepInactiveAccounts(ctx, new Date(NOW.getTime() + 15 * DAY))).toEqual({ warned: 0, disabled: 0, deleted: 1 });
        expect(await userRow(id)).toBeUndefined();
        const [audit] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "user.inactive_deleted"));
        expect(audit).toMatchObject({ targetId: id, targetLabel: null });
    });

    it("leaves accounts a SCIM directory manages, and banned ones", async () => {
        await policy(180, "disable");
        const banned = await account({ createdDaysAgo: 500 });
        await db.update(schema.user).set({ banned: true, banReason: "Admin action" }).where(eq(schema.user.id, banned));
        const provisioned = await account({ createdDaysAgo: 500 });
        const now = new Date();
        await db.insert(schema.scimUser).values({
            id: "scim_1",
            connectionId: "conn_1",
            provisioningDomainId: "org_1",
            userId: provisioned,
            connectionUserKey: "conn_1:alice",
            userName: "alice",
            userNameKey: "alice",
            primaryEmail: `${provisioned}@example.test`,
            workEmailValueIndex: "",
            emailValueIndex: "",
            displayName: "Alice",
            formattedName: "Alice",
            serializedEmails: "[]",
            active: true,
            orderKey: "1",
            createdAt: now,
            updatedAt: now,
        });
        expect(await sweepInactiveAccounts(ctx, NOW)).toEqual({ warned: 0, disabled: 0, deleted: 0 });
    });
});
