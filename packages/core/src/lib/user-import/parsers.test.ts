import { hashSync } from "bcryptjs";
import { describe, expect, it } from "vitest";

import { importDigest, parseImport } from "@ostiary/core/lib/user-import";
import { parseAuth0Import, parseAuth0PasswordHashes } from "@ostiary/core/lib/user-import/auth0";
import { parseCsvImport, parseCsvRecords } from "@ostiary/core/lib/user-import/csv";
import { MAX_IMPORT_BYTES, MAX_IMPORT_USERS } from "@ostiary/core/lib/user-import/limits";
import type { ParsedImport } from "@ostiary/core/lib/user-import/types";

const hash = hashSync("pw", 4);

function ok(parsed: ParsedImport) {
  if (!parsed.ok) throw new Error(`file refused: ${parsed.error}`);
  return parsed;
}

describe("CSV records", () => {
  it("reads quotes, escaped quotes, commas and newlines in quotes, CRLF, a BOM and blank lines", () => {
    const text = '﻿email,name\r\n"a@x.test","Doe, ""Jo""\nJr"\r\n\r\nb@x.test,Bo\n';
    expect(parseCsvRecords(text)).toEqual([
      ["email", "name"],
      ["a@x.test", 'Doe, "Jo"\nJr'],
      ["b@x.test", "Bo"],
    ]);
  });

  it("refuses an unclosed quote", () => {
    expect(parseCsvRecords('email\n"a@x.test')).toBeNull();
    expect(parseCsvImport('email\n"a@x.test', { allowAdmin: false })).toEqual({ ok: false, error: "csvUnbalancedQuotes" });
  });
});

describe("CSV import", () => {
  it("maps every column, in any order and case", () => {
    const text = `Role,EMAIL,name,username,email_verified,passwordHash\nuser, Ana@Example.COM ,Ana Lima,Ana_L,true,${hash}\n,bo@example.com,,,,\n`;
    const { users, errors } = ok(parseCsvImport(text, { allowAdmin: false }));
    expect(errors).toEqual([]);
    expect(users[0]).toMatchObject({
      row: 1,
      email: "ana@example.com",
      name: "Ana Lima",
      username: "ana_l",
      displayUsername: "Ana_L",
      emailVerified: true,
      role: "user",
      passwordHash: hash,
      blocked: false,
    });
    // No name: the address's local part. No hash: an account without a password.
    expect(users[1]).toMatchObject({ row: 2, email: "bo@example.com", name: "bo", username: null, emailVerified: false, passwordHash: null });
  });

  it("needs an email column and refuses unknown or repeated columns", () => {
    expect(parseCsvImport("name\nAna\n", { allowAdmin: false })).toEqual({ ok: false, error: "csvMissingEmail" });
    expect(parseCsvImport("email,password\na@x.test,hunter2\n", { allowAdmin: false })).toEqual({
      ok: false,
      error: "csvUnknownColumn",
      detail: "password",
    });
    expect(parseCsvImport("email,email_verified,emailVerified\n", { allowAdmin: false })).toMatchObject({ ok: false });
    expect(parseCsvImport("email,email_verified,emailVerified\na@x.test,1,1\n", { allowAdmin: false })).toMatchObject({
      ok: false,
      error: "csvDuplicateColumn",
    });
    expect(parseCsvImport("email\n", { allowAdmin: false })).toEqual({ ok: false, error: "empty" });
  });

  it("gives admin only when the admin allowed it", () => {
    const text = "email,role\nroot@x.test,admin\nweird@x.test,owner\n";
    expect(ok(parseCsvImport(text, { allowAdmin: false })).errors).toEqual([
      { row: 1, email: "root@x.test", reason: "adminNotAllowed" },
      { row: 2, email: "weird@x.test", reason: "invalidRole" },
    ]);
    const allowed = ok(parseCsvImport(text, { allowAdmin: true }));
    expect(allowed.users).toMatchObject([{ email: "root@x.test", role: "admin" }]);
  });

  it("reports each bad row with its reason", () => {
    const text = [
      "email,name,username,emailVerified,passwordHash",
      ",No Email,,,",
      "not-an-address,,,,",
      "c@x.test,,a b,,",
      "d@x.test,,,maybe,",
      `e@x.test,,,,$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA`,
      `f@x.test,,,,${hash.replace("$04$", "$20$")}`,
      "g@x.test,too,many,columns,here,!",
      `h@x.test,${"x".repeat(300)},,,`,
    ].join("\n");
    const { users, errors } = ok(parseCsvImport(text, { allowAdmin: false }));
    expect(users).toEqual([]);
    expect(errors.map((e) => [e.row, e.reason])).toEqual([
      [1, "missingEmail"],
      [2, "invalidEmail"],
      [3, "invalidUsername"],
      [4, "invalidEmailVerified"],
      [5, "invalidRecord"], // the argon2 hash's commas make extra columns
      [6, "bcryptCost"],
      [7, "invalidRecord"],
      [8, "invalidName"],
    ]);
  });

  it("refuses a quoted hash in another format", () => {
    const { errors } = ok(parseCsvImport('email,passwordHash\na@x.test,"$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA"\n', { allowAdmin: false }));
    expect(errors).toEqual([{ row: 1, email: "a@x.test", reason: "unsupportedHash" }]);
  });
});

const auth0User = (over: Record<string, unknown> = {}) => ({
  user_id: "auth0|65a1b2c3d4e5f6a7b8c9d0e1",
  email: "Jane@Example.com",
  email_verified: true,
  name: "jane@example.com",
  given_name: "Jane",
  family_name: "Doe",
  nickname: "jane",
  username: "jane.doe",
  picture: "https://s.gravatar.com/avatar/abc.png",
  created_at: "2023-04-01T10:00:00.000Z",
  ...over,
});

describe("Auth0 user export", () => {
  it("maps the export's fields (NDJSON)", () => {
    const text = [JSON.stringify(auth0User()), "", JSON.stringify(auth0User({ user_id: "google-oauth2|1", email: "g@example.com", name: undefined, username: undefined, picture: "http://insecure.test/p.png", created_at: "soon" }))].join("\n");
    const { users, errors } = ok(parseAuth0Import(text, null));
    expect(errors).toEqual([]);
    expect(users[0]).toMatchObject({
      row: 1,
      email: "jane@example.com",
      name: "jane@example.com",
      username: "jane.doe",
      emailVerified: true,
      image: "https://s.gravatar.com/avatar/abc.png",
      createdAt: new Date("2023-04-01T10:00:00.000Z"),
      role: "user",
      passwordHash: null,
    });
    // given_name + family_name when there is no name; only https pictures; bad dates dropped.
    expect(users[1]).toMatchObject({ email: "g@example.com", name: "Jane Doe", username: null, image: null, createdAt: null });
  });

  it("reads a JSON array too, and imports blocked users as blocked", () => {
    const { users } = ok(parseAuth0Import(JSON.stringify([auth0User({ blocked: true })]), null));
    expect(users[0]).toMatchObject({ email: "jane@example.com", blocked: true });
  });

  it("reports lines that are not JSON objects, and refuses a broken array", () => {
    const { users, errors } = ok(parseAuth0Import(`${JSON.stringify(auth0User())}\n{nope\n42\n{"name":"x"}`, null));
    expect(users).toHaveLength(1);
    expect(errors).toEqual([
      { row: 2, email: null, reason: "invalidRecord" },
      { row: 3, email: null, reason: "invalidRecord" },
      { row: 4, email: null, reason: "missingEmail" },
    ]);
    expect(parseAuth0Import("[{", null)).toEqual({ ok: false, error: "invalidJson" });
    expect(parseAuth0Import('{"a":1}', null)).toMatchObject({ ok: true });
  });

  it("never imports a role from the export", () => {
    const { users } = ok(parseAuth0Import(JSON.stringify(auth0User({ role: "admin" })), null));
    expect(users[0]!.role).toBe("user");
  });

  it("takes passwordHash from the record itself (the hash export imported alone)", () => {
    const record = { _id: { $oid: "65a1b2c3d4e5f6a7b8c9d0e1" }, email: "jane@example.com", email_verified: false, passwordHash: hash };
    const { users } = ok(parseAuth0Import(JSON.stringify(record), null));
    expect(users[0]).toMatchObject({ email: "jane@example.com", name: "jane", passwordHash: hash });
  });
});

describe("Auth0 password hash export", () => {
  const other = hashSync("other", 4);

  it("joins hashes by user_id, then by email", () => {
    const hashes = [
      JSON.stringify({ _id: { $oid: "65a1b2c3d4e5f6a7b8c9d0e1" }, email: "renamed@example.com", passwordHash: hash }),
      JSON.stringify({ _id: { $oid: "ffffffffffffffffffffffff" }, email: "bob@example.com", passwordHash: other }),
    ].join("\n");
    const users = [JSON.stringify(auth0User()), JSON.stringify(auth0User({ user_id: "auth0|other", email: "Bob@Example.com", username: "bob" }))].join("\n");
    const parsed = ok(parseAuth0Import(users, hashes));
    expect(parsed.users.map((u) => [u.email, u.passwordHash])).toEqual([
      ["jane@example.com", hash],
      ["bob@example.com", other],
    ]);
  });

  it("does not guess when one email has two different hashes", () => {
    const hashes = [
      JSON.stringify({ _id: { $oid: "a" }, email: "dup@example.com", passwordHash: hash }),
      JSON.stringify({ _id: { $oid: "b" }, email: "dup@example.com", passwordHash: other }),
    ].join("\n");
    const index = parseAuth0PasswordHashes(hashes)!;
    expect(index.byEmail.has("dup@example.com")).toBe(false);
    expect(index.byId.get("auth0|a")).toBe(hash);
  });

  it("refuses a hash file that does not parse, and checks the joined hash's format", () => {
    expect(parseAuth0Import(JSON.stringify(auth0User()), "{oops")).toEqual({ ok: false, error: "invalidHashFile" });
    const md5 = JSON.stringify({ email: "jane@example.com", passwordHash: "5f4dcc3b5aa765d61d8327deb882cf99" });
    expect(ok(parseAuth0Import(JSON.stringify(auth0User()), md5)).errors).toEqual([
      { row: 1, email: "Jane@Example.com", reason: "unsupportedHash" },
    ]);
  });
});

describe("limits and digest", () => {
  it("refuses files over the size or user limit", () => {
    const big = "x".repeat(MAX_IMPORT_BYTES + 1);
    expect(parseImport({ format: "csv", users: big, hashes: null, allowAdmin: false })).toEqual({ ok: false, error: "tooLarge" });
    const many = "email\n" + "a@x.test\n".repeat(MAX_IMPORT_USERS + 1);
    expect(parseImport({ format: "csv", users: many, hashes: null, allowAdmin: false })).toEqual({ ok: false, error: "tooManyUsers" });
    const lines = "{}\n".repeat(MAX_IMPORT_USERS + 1);
    expect(parseImport({ format: "auth0", users: lines, hashes: null, allowAdmin: false })).toEqual({ ok: false, error: "tooManyUsers" });
  });

  it("changes with the files and the options", () => {
    const base = { format: "csv" as const, users: "email\na@x.test\n", hashes: null, allowAdmin: false };
    const digest = importDigest(base);
    expect(importDigest({ ...base })).toBe(digest);
    expect(importDigest({ ...base, allowAdmin: true })).not.toBe(digest);
    expect(importDigest({ ...base, users: base.users + "b@x.test\n" })).not.toBe(digest);
    expect(importDigest({ ...base, format: "auth0" })).not.toBe(digest);
    expect(importDigest({ ...base, hashes: "" })).toBe(digest);
  });
});
