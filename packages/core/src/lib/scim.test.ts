import { describe, expect, it } from "vitest";

import {
  SCIM_DEACTIVATED_REASON,
  scimBaseUrl,
  scimCredentialHashSecret,
  scimIdentity,
  setScimDeactivated,
  ssoDomains,
  syncScimMembership,
} from "@ostiary/core/lib/scim";
import { PUBLIC_ORGANIZATION_ID } from "@ostiary/core/lib/organization-public";

type Row = Record<string, unknown>;
type Where = { field: string; value: unknown }[];

/** Just enough of Better Auth's adapter (equality filters) to run the SCIM callbacks. */
function fakeDatabase(tables: Record<string, Row[]>) {
  const matches = (row: Row, where: Where = []) => where.every((w) => (w.value === null ? row[w.field] == null : row[w.field] === w.value));
  const table = (model: string) => (tables[model] ??= []);
  let nextId = 1;
  const db = {
    tables,
    async findOne<T>({ model, where }: { model: string; where?: Where }) {
      return (table(model).find((r) => matches(r, where)) ?? null) as T | null;
    },
    async findMany<T>({ model, where }: { model: string; where?: Where }) {
      return table(model).filter((r) => matches(r, where)) as T[];
    },
    async create<T>({ model, data }: { model: string; data: Row }) {
      const row = { id: `gen_${nextId++}`, ...data };
      table(model).push(row);
      return row as T;
    },
    async update<T>({ model, where, update }: { model: string; where: Where; update: Row }) {
      const row = table(model).find((r) => matches(r, where));
      if (row) Object.assign(row, update);
      return (row ?? null) as T | null;
    },
    async updateMany({ model, where, update }: { model: string; where: Where; update: Row }) {
      const rows = table(model).filter((r) => matches(r, where));
      rows.forEach((r) => Object.assign(r, update));
      return rows.length;
    },
    async deleteMany({ model, where }: { model: string; where: Where }) {
      const before = table(model).length;
      tables[model] = table(model).filter((r) => !matches(r, where));
      return before - tables[model]!.length;
    },
  };
  return db;
}

// The callbacks only use the methods above.
type Db = Parameters<typeof setScimDeactivated>[0];
const asDb = (db: ReturnType<typeof fakeDatabase>) => db as unknown as Db;

describe("setScimDeactivated", () => {
  it("bans the account and revokes its OAuth tokens", async () => {
    const now = new Date("2026-10-08T12:00:00Z");
    const db = fakeDatabase({
      user: [{ id: "u1", banned: false }],
      oauthRefreshToken: [{ id: "r1", userId: "u1", revoked: null }, { id: "r2", userId: "u2", revoked: null }],
      oauthAccessToken: [{ id: "a1", userId: "u1", revoked: null }],
    });
    await setScimDeactivated(asDb(db), "u1", true, now);
    expect(db.tables.user![0]).toMatchObject({ banned: true, banReason: SCIM_DEACTIVATED_REASON });
    expect(db.tables.oauthRefreshToken![0]!.revoked).toBe(now);
    expect(db.tables.oauthRefreshToken![1]!.revoked).toBeNull();
    expect(db.tables.oauthAccessToken![0]!.revoked).toBe(now);
  });

  it("keeps an admin's ban and its reason", async () => {
    const db = fakeDatabase({ user: [{ id: "u1", banned: true, banReason: "Spam" }] });
    await setScimDeactivated(asDb(db), "u1", true);
    expect(db.tables.user![0]).toMatchObject({ banned: true, banReason: "Spam" });
  });

  it("reactivation lifts only the provisioning ban", async () => {
    const db = fakeDatabase({
      user: [
        { id: "u1", banned: true, banReason: SCIM_DEACTIVATED_REASON },
        { id: "u2", banned: true, banReason: "Spam" },
      ],
    });
    await setScimDeactivated(asDb(db), "u1", false);
    await setScimDeactivated(asDb(db), "u2", false);
    expect(db.tables.user![0]).toMatchObject({ banned: false, banReason: null });
    expect(db.tables.user![1]).toMatchObject({ banned: true, banReason: "Spam" });
  });
});

describe("syncScimMembership", () => {
  it("adds a provisioned user as a member", async () => {
    const db = fakeDatabase({ organization: [{ id: "org1" }], member: [] });
    await syncScimMembership(asDb(db), "org1", "u1", true);
    await syncScimMembership(asDb(db), "org1", "u1", true);
    expect(db.tables.member).toHaveLength(1);
    expect(db.tables.member![0]).toMatchObject({ organizationId: "org1", userId: "u1", role: "member" });
  });

  it("removes a plain member once no longer provisioned, but keeps owners and admins", async () => {
    const db = fakeDatabase({
      organization: [{ id: "org1" }],
      member: [
        { id: "m1", organizationId: "org1", userId: "u1", role: "member" },
        { id: "m2", organizationId: "org1", userId: "u2", role: "owner" },
      ],
    });
    await syncScimMembership(asDb(db), "org1", "u1", false);
    await syncScimMembership(asDb(db), "org1", "u2", false);
    expect(db.tables.member!.map((m) => m.id)).toEqual(["m2"]);
  });

  it("ignores the Public workspace and unknown organizations", async () => {
    const db = fakeDatabase({ organization: [{ id: PUBLIC_ORGANIZATION_ID }], member: [] });
    await syncScimMembership(asDb(db), PUBLIC_ORGANIZATION_ID, "u1", true);
    await syncScimMembership(asDb(db), "gone", "u1", true);
    expect(db.tables.member).toHaveLength(0);
  });
});

describe("scimIdentity.resolveUser", () => {
  const resolve = (db: ReturnType<typeof fakeDatabase>, email: string) =>
    scimIdentity.resolveUser!(
      { connectionId: "c1", provisioningDomainId: "org1", resource: { primaryEmail: email } as never },
      { database: db as never },
    );
  const providers = [
    { organizationId: "org1", domain: "acme.com", domainVerified: true },
    { organizationId: "org1", domain: "acme.fr", domainVerified: false },
    { organizationId: "org2", domain: "other.com", domainVerified: true },
  ];

  it("creates an account for a new address", async () => {
    const db = fakeDatabase({ user: [], ssoProvider: providers });
    expect(await resolve(db, "new@acme.com")).toEqual({ action: "create" });
  });

  it("links a verified account in a domain the organization verified", async () => {
    const db = fakeDatabase({ user: [{ id: "u1", email: "ada@acme.com", emailVerified: true, role: "user" }], ssoProvider: providers });
    expect(await resolve(db, "Ada@Acme.com")).toEqual({ action: "link", userId: "u1", profile: "preserve" });
  });

  it("never links unverified addresses, unverified domains, other organizations' domains or admins", async () => {
    const db = fakeDatabase({
      user: [
        { id: "u1", email: "a@acme.com", emailVerified: false, role: "user" },
        { id: "u2", email: "b@acme.fr", emailVerified: true, role: "user" },
        { id: "u3", email: "c@other.com", emailVerified: true, role: "user" },
        { id: "u4", email: "d@acme.com", emailVerified: true, role: "user,admin" },
      ],
      ssoProvider: providers,
    });
    for (const email of ["a@acme.com", "b@acme.fr", "c@other.com", "d@acme.com"]) {
      expect(await resolve(db, email)).toEqual({ action: "create" });
    }
  });
});

describe("helpers", () => {
  it("parses SSO provider domains", () => {
    expect(ssoDomains("Acme.com, https://acme.fr/x,,")).toEqual(["acme.com", "acme.fr"]);
  });

  it("builds the base URL on the auth app", () => {
    expect(scimBaseUrl("https://auth.example.com/")).toBe("https://auth.example.com/api/auth/scim/v2");
  });

  it("derives a stable token key unless SCIM_TOKEN_SECRET is set", () => {
    const secret = "s".repeat(32);
    const derived = scimCredentialHashSecret({ BETTER_AUTH_SECRET: secret });
    expect(derived).toHaveLength(64);
    expect(derived).not.toContain(secret);
    expect(scimCredentialHashSecret({ BETTER_AUTH_SECRET: secret })).toBe(derived);
    expect(scimCredentialHashSecret({ BETTER_AUTH_SECRET: secret, SCIM_TOKEN_SECRET: "t".repeat(32) })).toBe("t".repeat(32));
  });
});
