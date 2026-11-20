import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { hashSync } from "bcryptjs";
import { verifyPassword } from "better-auth/crypto";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@ostiary/core/db/schema";
import type { Database } from "@ostiary/core/lib/account-data/database";
import { PUBLIC_ORGANIZATION_ID } from "@ostiary/core/lib/organization-public";
import { commitImport, previewImport, type ImportInput } from "@ostiary/core/lib/user-import";
import { importedPasswordVerifier, replaceImportedHash } from "@ostiary/core/lib/user-import/password-hash";

/* The dry run and the import against a real schema (PGlite): what is skipped, what is written. */

const client = new PGlite();
const db = drizzle(client, { schema }) as unknown as Database;
const now = new Date("2026-11-01T12:00:00Z");
const hash = hashSync("imported-password", 4);

beforeAll(async () => {
  await migrate(drizzle(client), { migrationsFolder: path.resolve(__dirname, "../../db/migrations") });
  const user = (id: string, email: string, username: string | null = null) => ({ id, name: id, email, username, emailVerified: true, createdAt: now, updatedAt: now });
  await db.insert(schema.user).values([
    user("usr_existing", "existing@example.com", "taken_name"),
    user("usr_gmail", "john.doe@gmail.com"),
  ]);
}, 60_000);

afterAll(async () => {
  await client.close();
});

const csv = (rows: string[]): ImportInput => ({
  format: "csv",
  users: ["email,name,username,emailVerified,role,passwordHash", ...rows].join("\n"),
  hashes: null,
  allowAdmin: false,
});

describe("dry run", () => {
  it("counts new, existing, alias, duplicate and invalid rows, and writes nothing", async () => {
    const input = csv([
      `new1@example.com,New One,new_one,true,,${hash}`,
      "EXISTING@example.com,Again,,,,", // exact address of an account
      "johndoe+shop@gmail.com,Alias,,,,", // same Gmail inbox as john.doe@gmail.com
      "new1@example.com,Twice,,,,", // second row for one address
      "new2@example.com,Taken,taken_name,,,",
      "new3@example.com,Bad,,,,md5:abc",
    ]);
    const before = await db.select({ id: schema.user.id }).from(schema.user);
    const preview = await previewImport(db, input, "gmail");
    if (!preview.ok) throw new Error(preview.error);
    expect(preview.summary).toMatchObject({
      rows: 6,
      toCreate: 1,
      withPassword: 1,
      admins: 0,
      skippedExisting: 1,
      skippedAlias: 1,
      invalid: 3,
    });
    expect(preview.summary.errors.map((e) => [e.row, e.reason])).toEqual([
      [4, "duplicateInFile"],
      [5, "usernameTaken"],
      [6, "unsupportedHash"],
    ]);
    expect(await db.select({ id: schema.user.id }).from(schema.user)).toHaveLength(before.length);
  });

  it("lets an alias through with EMAIL_DEDUP=off", async () => {
    const preview = await previewImport(db, csv(["johndoe+shop@gmail.com,Alias,,,,"]), "off");
    expect(preview.ok && preview.summary.toCreate).toBe(1);
  });
});

describe("import", () => {
  it("creates the user, its credential account and its Public membership, and never an admin", async () => {
    const input: ImportInput = {
      format: "auth0",
      users: [
        JSON.stringify({ user_id: "auth0|1", email: "jane@example.com", email_verified: true, name: "Jane", username: "Jane.D", created_at: "2022-01-02T03:04:05.000Z" }),
        JSON.stringify({ user_id: "auth0|2", email: "nopass@example.com", email_verified: false, blocked: true }),
      ].join("\n"),
      hashes: JSON.stringify({ _id: { $oid: "1" }, email: "jane@example.com", passwordHash: hash }),
      allowAdmin: true,
    };
    const preview = await previewImport(db, input, "gmail");
    if (!preview.ok) throw new Error(preview.error);
    const result = await commitImport(db, preview.plan.toCreate);
    expect(result).toEqual({ created: 2, withPassword: 1, skippedConflict: 0, notImported: 0 });

    const users = await db.select().from(schema.user).where(inArray(schema.user.email, ["jane@example.com", "nopass@example.com"]));
    const jane = users.find((u) => u.email === "jane@example.com")!;
    const nopass = users.find((u) => u.email === "nopass@example.com")!;
    expect(jane).toMatchObject({ name: "Jane", username: "jane.d", displayUsername: "Jane.D", emailVerified: true, role: "user", banned: false });
    expect(jane.createdAt.toISOString()).toBe("2022-01-02T03:04:05.000Z");
    expect(nopass).toMatchObject({ emailVerified: false, role: "user", banned: true });

    const accounts = await db.select().from(schema.account).where(inArray(schema.account.userId, [jane.id, nopass.id]));
    expect(accounts).toEqual([expect.objectContaining({ userId: jane.id, accountId: jane.id, providerId: "credential", password: hash })]);

    const members = await db.select().from(schema.member).where(inArray(schema.member.userId, [jane.id, nopass.id]));
    expect(members.map((m) => [m.organizationId, m.role])).toEqual([
      [PUBLIC_ORGANIZATION_ID, "member"],
      [PUBLIC_ORGANIZATION_ID, "member"],
    ]);
  });

  it("skips an address an account took after the dry run instead of overwriting it", async () => {
    const preview = await previewImport(db, csv(["late@example.com,Late,,,,", "fine@example.com,Fine,,,,"]), "gmail");
    if (!preview.ok) throw new Error(preview.error);
    await db.insert(schema.user).values({ id: "usr_late", name: "Original", email: "late@example.com", emailVerified: true, createdAt: now, updatedAt: now });
    expect(await commitImport(db, preview.plan.toCreate)).toEqual({ created: 1, withPassword: 0, skippedConflict: 1, notImported: 0 });
    const [late] = await db.select().from(schema.user).where(eq(schema.user.email, "late@example.com"));
    expect(late).toMatchObject({ id: "usr_late", name: "Original" });
  });

  it("replaces the bcrypt hash with scrypt at the first sign-in", async () => {
    const [jane] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, "jane@example.com"));
    const verify = importedPasswordVerifier(replaceImportedHash(db));
    const stored = async () =>
      (await db.select({ password: schema.account.password }).from(schema.account).where(and(eq(schema.account.userId, jane!.id), eq(schema.account.providerId, "credential"))))[0]!.password!;

    expect(await verify({ hash: await stored(), password: "wrong" })).toBe(false);
    expect(await stored()).toBe(hash);
    expect(await verify({ hash: await stored(), password: "imported-password" })).toBe(true);
    const rehashed = await stored();
    expect(rehashed).not.toBe(hash);
    expect(rehashed.startsWith("$2")).toBe(false);
    expect(await verifyPassword({ hash: rehashed, password: "imported-password" })).toBe(true);
    expect(await verify({ hash: rehashed, password: "imported-password" })).toBe(true);
  });
});
