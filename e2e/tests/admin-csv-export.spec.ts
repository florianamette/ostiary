import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { APIResponse } from "@playwright/test";

import { createUser } from "../support/auth";
import { query, userIdOf } from "../support/db";
import { ADMIN_EMAIL, ADMIN_URL } from "../support/env";
import { expect, test } from "../support/fixtures";

/*
 * CSV exports of the Users and Audit pages: admin only, the page's filters applied, RFC 4180
 * with a BOM, formulas neutralised, and each export audited.
 */

const FILENAME = (name: string) => new RegExp(`^attachment; filename="ostiary-${name}-\\d{4}-\\d{2}-\\d{2}\\.csv"$`);

/** RFC 4180 records (quoted fields, doubled quotes, CRLF), the BOM removed. */
function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\r" && input[i + 1] === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      i++;
    } else field += c;
  }
  if (field || record.length) records.push([...record, field]);
  return records;
}

/** Checks the download headers and the BOM; returns the records as objects keyed by the header. */
async function readExport(response: APIResponse, name: string) {
  expect(response.status(), await response.text()).toBe(200);
  const headers = response.headers();
  expect(headers["content-type"]).toBe("text/csv; charset=utf-8");
  expect(headers["content-disposition"]).toMatch(FILENAME(name));
  expect(headers["cache-control"]).toBe("no-store");
  const body = await response.body();
  expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const [header, ...rows] = parseCsv(body.toString("utf8"));
  return { header: header!, rows: rows.map((row) => Object.fromEntries(header!.map((column, i) => [column, row[i]]))) };
}

async function lastExportAudit(action: string, filterQ: string) {
  const rows = await query<{ actor_email: string; metadata: { filters: Record<string, string>; rows: number; truncated: boolean } }>(
    `select actor_email, metadata from audit_log where action = $1 and metadata->'filters'->>'q' = $2 order by created_at desc limit 1`,
    [action, filterQ],
  );
  return rows[0];
}

test("an admin exports the users list as CSV, with the page's filters", async ({ api, adminApi }) => {
  const member = await createUser(api, "csvuser");
  const formulaName = '=HYPERLINK("http://evil.e2e.test"), Doe';
  await query(`update "user" set name = $1, banned = true, ban_reason = $2, ban_expires = $3 where email = $4`, [
    formulaName,
    "spam, \"bulk\"",
    "2031-05-06T07:08:09.123Z",
    member.email,
  ]);
  const id = await userIdOf(member.email);
  await query(`insert into auth_event (id, type, user_id, created_at) values ($1, 'sign_in', $2, $3)`, [
    randomUUID(),
    id,
    "2030-01-01T00:00:00.000Z",
  ]);
  const [stored] = await query<{ created_at: Date; updated_at: Date }>(`select created_at, updated_at from "user" where id = $1`, [id]);

  const { header, rows } = await readExport(await adminApi.get(`/api/admin/users/export?q=${encodeURIComponent(member.email)}`), "users");
  expect(header).toEqual([
    "id",
    "email",
    "name",
    "username",
    "role",
    "emailVerified",
    "banned",
    "banReason",
    "banExpires",
    "twoFactorEnabled",
    "createdAt",
    "updatedAt",
    "lastSignInAt",
  ]);
  expect(rows).toEqual([
    {
      id,
      email: member.email,
      name: `'${formulaName}`,
      username: member.username,
      role: "user",
      emailVerified: "true",
      banned: "true",
      banReason: 'spam, "bulk"',
      banExpires: "2031-05-06T07:08:09.123Z",
      twoFactorEnabled: "false",
      createdAt: stored!.created_at.toISOString(),
      updatedAt: stored!.updated_at.toISOString(),
      lastSignInAt: "2030-01-01T00:00:00.000Z",
    },
  ]);

  // The export is audited, in the admin's name, with the filter and the row count.
  expect(await lastExportAudit("user.export_csv", member.email)).toEqual({
    actor_email: ADMIN_EMAIL,
    metadata: { filters: { q: member.email }, rows: 1, truncated: false },
  });

  // The role filter applies too: this user is not an admin.
  const admins = await readExport(await adminApi.get(`/api/admin/users/export?q=${encodeURIComponent(member.email)}&role=admin`), "users");
  expect(admins.rows).toEqual([]);
  expect(await lastExportAudit("user.export_csv", member.email)).toEqual({
    actor_email: ADMIN_EMAIL,
    metadata: { filters: { q: member.email, role: "admin" }, rows: 0, truncated: false },
  });
});

test("an admin exports the audit log as CSV, with the page's filters", async ({ adminApi }) => {
  const actor = `csv-auditor-${randomBytes(5).toString("hex")}@e2e.test`;
  const entryId = randomUUID();
  await query(
    `insert into audit_log (id, actor_email, action, target_type, target_id, target_label, metadata, ip_address, created_at)
     values ($1, $2, 'user.update', 'webhook', 'wh_1', $3, $4, '203.0.113.7', '2026-01-02T03:04:05.678Z')`,
    [entryId, actor, '@risky, "label"', JSON.stringify({ field: "name", note: "=1+1" })],
  );
  // Another area, same actor: left out by the `user` filter.
  await query(`insert into audit_log (id, actor_email, action) values ($1, $2, 'webhook.create')`, [randomUUID(), actor]);

  const { header, rows } = await readExport(
    await adminApi.get(`/api/admin/audit/export?type=user&q=${encodeURIComponent(actor)}`),
    "audit-log",
  );
  expect(header).toEqual(["id", "createdAt", "actorId", "actorEmail", "action", "targetType", "targetId", "target", "ipAddress", "metadata"]);
  expect(rows).toEqual([
    {
      id: entryId,
      createdAt: "2026-01-02T03:04:05.678Z",
      actorId: "",
      actorEmail: actor,
      action: "user.update",
      targetType: "webhook",
      targetId: "wh_1",
      target: `'@risky, "label"`,
      ipAddress: "203.0.113.7",
      metadata: JSON.stringify({ note: "=1+1", field: "name" }),
    },
  ]);

  const audit = await lastExportAudit("audit_log.export_csv", actor);
  expect(audit).toEqual({ actor_email: ADMIN_EMAIL, metadata: { filters: { type: "user", q: actor }, rows: 1, truncated: false } });
});

test("the export buttons download the filtered lists", async ({ adminPage, api }) => {
  const member = await createUser(api, "csvbutton");
  await adminPage.goto(`/en/users?q=${encodeURIComponent(member.email)}`);
  const button = adminPage.getByRole("link", { name: "Export CSV" });
  await expect(button).toHaveAttribute("href", `/api/admin/users/export?q=${encodeURIComponent(member.email)}`);
  const [download] = await Promise.all([adminPage.waitForEvent("download"), button.click()]);
  expect(download.suggestedFilename()).toMatch(/^ostiary-users-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = await readFile((await download.path())!, "utf8");
  expect(parseCsv(text).map((row) => row[1])).toEqual(["email", member.email]);

  await adminPage.goto("/en/audit?type=webhook&q=nobody");
  await expect(adminPage.getByRole("link", { name: "Export CSV" })).toHaveAttribute(
    "href",
    "/api/admin/audit/export?type=webhook&q=nobody",
  );
});

test("exports are refused to non-admins, signed-out visitors and other sites", async ({ api, adminApi, playwright, clientIp }) => {
  const paths = ["/api/admin/users/export", "/api/admin/audit/export"];

  const anonymous = await playwright.request.newContext({ baseURL: ADMIN_URL, extraHTTPHeaders: { "x-forwarded-for": clientIp } });
  await createUser(api, "csvnonadmin");
  const member = await playwright.request.newContext({
    baseURL: ADMIN_URL,
    storageState: await api.storageState(),
    extraHTTPHeaders: { "x-forwarded-for": clientIp },
  });
  try {
    for (const path of paths) {
      const signedOut = await anonymous.get(path);
      expect(signedOut.status(), path).toBe(401);
      expect(signedOut.headers()["cache-control"]).toBe("no-store");

      const notAdmin = await member.get(path);
      expect(notAdmin.status(), path).toBe(403);
      expect(notAdmin.headers()["content-disposition"]).toBeUndefined();

      // A link on another site cannot make an admin's browser run an export.
      const crossSite = await adminApi.get(path, { headers: { "sec-fetch-site": "cross-site" } });
      expect(crossSite.status(), path).toBe(403);
    }
  } finally {
    await anonymous.dispose();
    await member.dispose();
  }
});
