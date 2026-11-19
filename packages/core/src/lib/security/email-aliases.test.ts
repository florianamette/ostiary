import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@ostiary/core/db/schema";
import type { Database } from "@ostiary/core/lib/account-data/database";
import { emailAlias, emailAliasSql, emailAliasTaken } from "@ostiary/core/lib/security/email-aliases";

const client = new PGlite();
const db = drizzle(client, { schema }) as unknown as Database;
const now = new Date("2026-11-01T12:00:00Z");

beforeAll(async () => {
  await migrate(drizzle(client), { migrationsFolder: path.resolve(__dirname, "../../db/migrations") });
  const user = (id: string, email: string) => ({ id, name: id, email, emailVerified: true, createdAt: now, updatedAt: now });
  await db.insert(schema.user).values([
    user("usr_john", "john.doe@gmail.com"),
    user("usr_ana", "ana+news@example.org"),
    user("usr_corp", "j.smith@corp.example"),
  ]);
});

afterAll(async () => {
  await client.close();
});

describe("emailAlias", () => {
  it("reduces Gmail aliases to one address", () => {
    for (const alias of ["John.Doe@gmail.com", "johndoe@gmail.com", "j.o.h.n.d.o.e+shop@googlemail.com", " johndoe+@GMAIL.COM "]) {
      expect(emailAlias(alias, "gmail")).toBe("johndoe@gmail.com");
    }
  });

  it("leaves other domains alone with gmail, drops their +tag with plus", () => {
    expect(emailAlias("j.smith+x@corp.example", "gmail")).toBe("j.smith+x@corp.example");
    expect(emailAlias("J.Smith+x@corp.example", "plus")).toBe("j.smith@corp.example");
  });

  it("keeps addresses with nothing before the +tag as typed", () => {
    expect(emailAlias("+x@gmail.com", "gmail")).toBe("+x@gmail.com");
    expect(emailAlias("...@gmail.com", "gmail")).toBe("...@gmail.com");
    expect(emailAlias("+x@corp.example", "plus")).toBe("+x@corp.example");
    expect(emailAlias("no-at-sign", "plus")).toBe("no-at-sign");
  });
});

describe("emailAliasSql", () => {
  const samples = [
    "John.Doe@gmail.com",
    "j.o.h.n.d.o.e+shop@googlemail.com",
    "johndoe+@gmail.com",
    "+x@gmail.com",
    "...@gmail.com",
    "j.smith+x@corp.example",
    "J.Smith@Corp.Example",
    "+x@corp.example",
    "a+b+c@corp.example",
    "\"a@b\"@corp.example",
    "@corp.example",
    "no-at-sign",
  ];

  for (const mode of ["gmail", "plus"] as const) {
    it(`gives the same result as emailAlias (${mode})`, async () => {
      for (const email of samples) {
        const result = await db.execute<{ alias: string }>(sql`select ${emailAliasSql(sql`${email}::text`, mode)} as alias`);
        const rows = (result as unknown as { rows: { alias: string }[] }).rows;
        expect([email, rows[0].alias]).toEqual([email, emailAlias(email, mode)]);
      }
    });
  }
});

describe("emailAliasTaken", () => {
  it("finds an account behind a Gmail alias", async () => {
    expect(await emailAliasTaken(db, "johndoe+promo@googlemail.com", "gmail")).toBe(true);
    expect(await emailAliasTaken(db, "jane.doe@gmail.com", "gmail")).toBe(false);
  });

  it("ignores the account itself (an email change to an alias of one's own address)", async () => {
    expect(await emailAliasTaken(db, "johndoe@gmail.com", "gmail", "usr_john")).toBe(false);
    expect(await emailAliasTaken(db, "johndoe@gmail.com", "gmail", "usr_ana")).toBe(true);
  });

  it("matches +tags on other domains only with plus", async () => {
    expect(await emailAliasTaken(db, "ana@example.org", "gmail")).toBe(false);
    expect(await emailAliasTaken(db, "ana@example.org", "plus")).toBe(true);
    expect(await emailAliasTaken(db, "jsmith@corp.example", "plus")).toBe(false);
  });

  it("checks nothing when off", async () => {
    expect(await emailAliasTaken(db, "john.doe@gmail.com", "off")).toBe(false);
  });
});
