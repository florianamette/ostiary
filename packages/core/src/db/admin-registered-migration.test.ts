import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
 * Migration 0013 adds `oauth_client.admin_registered` (false unless set) and marks the clients
 * that existed before it: admin-made ones keep working as admin-registered and move to the
 * platform's ownership; clients ordinary users created themselves stay self-registered.
 */

const MIGRATIONS = path.resolve(__dirname, "migrations");
const TAG = "0013_oauth_client_admin_registered";

const client = new PGlite();
let before: string;

/** A copy of the migrations folder that stops just before 0013. */
function migrationsBefore(tag: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ostiary-migrations-"));
  cpSync(MIGRATIONS, dir, { recursive: true });
  const journalPath = path.join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
  const index = journal.entries.findIndex((entry) => entry.tag === tag);
  expect(index).toBeGreaterThan(0);
  journal.entries = journal.entries.slice(0, index);
  writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

async function insertClient(id: string, values: { userId?: string | null; metadata?: string | null; discovery?: string | null }) {
  await client.query(
    `insert into oauth_client (id, client_id, redirect_uris, user_id, metadata, client_discovery_id, created_at, updated_at)
     values ($1, $1, '{https://app.example/cb}', $2, $3::jsonb, $4, now(), now())`,
    [id, values.userId ?? null, values.metadata ?? null, values.discovery ?? null],
  );
}

beforeAll(async () => {
  before = migrationsBefore(TAG);
  await migrate(drizzle(client), { migrationsFolder: before });

  await client.query(
    `insert into "user" (id, name, email, email_verified, role, created_at, updated_at) values
       ('u_admin', 'Admin', 'admin@example.test', true, 'user, admin', now(), now()),
       ('u_former', 'Former admin', 'former@example.test', true, 'user', now(), now()),
       ('u_user', 'User', 'user@example.test', true, null, now(), now())`,
  );
  await insertClient("c_admin_owned", { userId: "u_admin" });
  // Created from the console by someone who is no longer an admin: the console logged it.
  await insertClient("c_former_console", { userId: "u_former" });
  await client.query(
    `insert into audit_log (id, actor_id, action, target_type, target_id, created_at)
     values ('a1', 'u_former', 'oauth_client.create', 'oauth_client', 'c_former_console', now())`,
  );
  // Kept, without owner, when its admin's account was deleted.
  await insertClient("c_detached", { userId: null });
  // Created by an ordinary user through Better Auth's /oauth2/create-client.
  await insertClient("c_user_made", { userId: "u_user" });
  await insertClient("c_dynamic", { userId: "u_admin", metadata: JSON.stringify({ ostiary_registration: "dynamic" }) });
  // Better Auth may store the metadata as a JSON string inside the jsonb column.
  await insertClient("c_dynamic_string", { userId: null, metadata: JSON.stringify(JSON.stringify({ ostiary_registration: "dynamic" })) });
  await insertClient("https://agent.example/client.json", { discovery: "cimd" });

  await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });
});

afterAll(async () => {
  await client.close();
  rmSync(before, { recursive: true, force: true });
});

describe(`migration ${TAG}`, () => {
  it("marks admin-made clients and gives them to the platform", async () => {
    const { rows } = await client.query<{ client_id: string; admin_registered: boolean; user_id: string | null; reference_id: string | null }>(
      "select client_id, admin_registered, user_id, reference_id from oauth_client order by client_id",
    );
    const byId = Object.fromEntries(rows.map((row) => [row.client_id, row]));
    for (const id of ["c_admin_owned", "c_former_console", "c_detached"]) {
      expect(byId[id], id).toMatchObject({ admin_registered: true, user_id: null, reference_id: "ostiary:platform" });
    }
    expect(byId.c_user_made).toMatchObject({ admin_registered: false, user_id: "u_user", reference_id: null });
    expect(byId.c_dynamic).toMatchObject({ admin_registered: false, user_id: "u_admin" });
    expect(byId.c_dynamic_string).toMatchObject({ admin_registered: false });
    expect(byId["https://agent.example/client.json"]).toMatchObject({ admin_registered: false });
  });

  it("leaves new clients unmarked by default", async () => {
    await client.query(
      "insert into oauth_client (id, client_id, redirect_uris) values ('c_new', 'c_new', '{https://app.example/cb}')",
    );
    const { rows } = await client.query<{ admin_registered: boolean }>("select admin_registered from oauth_client where id = 'c_new'");
    expect(rows[0]?.admin_registered).toBe(false);
  });
});
