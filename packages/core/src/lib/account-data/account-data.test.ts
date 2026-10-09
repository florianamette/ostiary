import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@ostiary/core/db/schema";
import { accountDeletionBlockers } from "@ostiary/core/lib/account-data/blockers";
import type { Database } from "@ostiary/core/lib/account-data/database";
import { DELETED_USER_LABEL, prepareUserErasure, scrubValue } from "@ostiary/core/lib/account-data/erasure";
import { buildAccountExport } from "@ostiary/core/lib/account-data/export";
import { PUBLIC_ORGANIZATION_ID } from "@ostiary/core/lib/organization-public";

/*
 * Export and erasure against a real Postgres (PGlite, in memory) with every migration applied,
 * so the foreign keys are the production ones. A user gets a row in every table that can refer
 * to an account; after erasure and deletion, no column anywhere may still hold their email,
 * username or name, and only the audit log may hold their (pseudonymous) id.
 */

const client = new PGlite();
const db = drizzle(client, { schema }) as unknown as Database;

const U = {
  id: "usr_erase_me_7f3a",
  email: "Erika.Mustermann@example.org",
  name: "Erika Mustermann-Quaid",
  username: "erika_q_77",
};
const OTHER = { id: "usr_other_admin_2b1c", email: "admin.other@example.net", name: "Other Admin" };

/** Values that must never appear in an export. */
const SECRETS = {
  passwordHash: "scrypt$secret-password-hash-0001",
  githubAccessToken: "gho_secret_access_token_0002",
  githubRefreshToken: "ghr_secret_refresh_token_0003",
  githubIdToken: "eyJ.secret-id-token.0004",
  sessionToken: "sess_secret_token_0005",
  totpSecret: "TOTPSECRETBASE32VALUE0006",
  backupCodes: "backup-0007-aaaa,backup-0007-bbbb",
  passkeyPublicKey: "pk_secret_public_key_material_0008",
  passkeyCredentialId: "cred_secret_credential_id_0009",
  apiKeyDigest: "sha256_secret_key_digest_0010",
  clientSecret: "client_secret_value_0011",
  refreshToken: "oauth_refresh_secret_0012",
  accessToken: "oauth_access_secret_0013",
  verificationValue: "verify_secret_value_0014",
  adminIp: "198.51.100.77",
};

const now = new Date("2026-10-01T12:00:00Z");
const later = new Date("2027-10-01T12:00:00Z");

beforeAll(async () => {
  await migrate(drizzle(client), { migrationsFolder: path.resolve(__dirname, "../../db/migrations") });
});

afterAll(async () => {
  await client.close();
});

async function reset() {
  const tables = await client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public' and tablename <> 'organization'",
  );
  const names = tables.rows.map((r) => `"${r.tablename}"`).join(", ");
  await client.exec(`truncate ${names} cascade`);
  await client.query(`delete from "organization" where id <> $1`, [PUBLIC_ORGANIZATION_ID]);
}

/** The user to erase, with a row in every table that can refer to an account. */
async function seed() {
  const s = schema;
  await db.insert(s.user).values([
    { id: U.id, name: U.name, email: U.email, username: U.username, displayUsername: U.username, emailVerified: true, twoFactorEnabled: true, createdAt: now, updatedAt: now },
    { id: OTHER.id, name: OTHER.name, email: OTHER.email, emailVerified: true, role: "admin", createdAt: now, updatedAt: now },
  ]);
  await db.insert(s.organization).values({ id: "org_acme", name: "Acme", slug: "acme", createdAt: now });
  await db.insert(s.member).values([
    { id: "mem_u_public", organizationId: PUBLIC_ORGANIZATION_ID, userId: U.id, role: "member", createdAt: now },
    { id: "mem_u_acme", organizationId: "org_acme", userId: U.id, role: "admin", createdAt: now },
    { id: "mem_o_acme", organizationId: "org_acme", userId: OTHER.id, role: "owner", createdAt: now },
  ]);
  await db.insert(s.invitation).values([
    { id: "inv_sent", organizationId: "org_acme", email: "friend@example.com", role: "member", inviterId: U.id, expiresAt: later, createdAt: now },
    { id: "inv_received", organizationId: "org_acme", email: U.email.toLowerCase(), role: "member", inviterId: OTHER.id, expiresAt: later, createdAt: now },
  ]);
  await db.insert(s.session).values([
    { id: "ses_u", token: SECRETS.sessionToken, userId: U.id, expiresAt: later, createdAt: now, updatedAt: now, ipAddress: "203.0.113.5", userAgent: "Mozilla/5.0 (Erika)", activeOrganizationId: "org_acme" },
    { id: "ses_impersonation", token: "sess_impersonation", userId: OTHER.id, impersonatedBy: U.id, expiresAt: later, createdAt: now, updatedAt: now },
  ]);
  await db.insert(s.account).values([
    { id: "acc_cred", accountId: U.id, providerId: "credential", userId: U.id, password: SECRETS.passwordHash, createdAt: now, updatedAt: now },
    { id: "acc_gh", accountId: "1234567", providerId: "github", userId: U.id, accessToken: SECRETS.githubAccessToken, refreshToken: SECRETS.githubRefreshToken, idToken: SECRETS.githubIdToken, scope: "read:user,user:email", createdAt: now, updatedAt: now },
  ]);
  await db.insert(s.verification).values([
    { id: "ver_trust", identifier: "trust-device-abc", value: U.id, expiresAt: later },
    { id: "ver_otp", identifier: `sign-in-otp-${U.email.toLowerCase()}`, value: SECRETS.verificationValue, expiresAt: later },
    { id: "ver_delete", identifier: "delete-account-tok", value: U.id, expiresAt: later },
  ]);
  await db.insert(s.passkey).values({ id: "pk_1", name: "Erika's laptop", publicKey: SECRETS.passkeyPublicKey, userId: U.id, credentialID: SECRETS.passkeyCredentialId, counter: 3, deviceType: "multiDevice", backedUp: true, transports: "internal,hybrid", createdAt: now });
  await db.insert(s.twoFactor).values({ id: "tf_1", secret: SECRETS.totpSecret, backupCodes: SECRETS.backupCodes, userId: U.id });
  await db.insert(s.oauthClient).values([
    // Registered by another admin, used by the user.
    { id: "cl_other", clientId: "client-other", clientSecret: SECRETS.clientSecret, name: "Notes", redirectUris: ["https://notes.example/cb"], userId: OTHER.id, adminRegistered: true, createdAt: now, updatedAt: now },
    // Registered by the user from the admin console (instance app): detached, kept.
    { id: "cl_console", clientId: "client-console", name: "Console app", redirectUris: ["https://console.example/cb"], userId: U.id, adminRegistered: true, createdAt: now, updatedAt: now },
    // Created by the user through Better Auth's client endpoint, without the admin marker: theirs.
    { id: "cl_unmarked", clientId: "client-unmarked", name: "Unmarked", redirectUris: ["https://unmarked.example/cb"], userId: U.id, createdAt: now, updatedAt: now },
    // Registered by the user through Dynamic Client Registration: theirs, deleted with them.
    { id: "cl_dynamic", clientId: "client-dynamic", name: "My script", redirectUris: ["http://127.0.0.1/cb"], userId: U.id, metadata: { ostiary_registration: "dynamic" }, createdAt: now, updatedAt: now },
  ]);
  await db.insert(s.oauthRefreshToken).values({ id: "rt_1", token: SECRETS.refreshToken, clientId: "client-other", sessionId: "ses_u", userId: U.id, expiresAt: later, createdAt: now, scopes: ["openid", "email"] });
  await db.insert(s.oauthAccessToken).values({ id: "at_1", token: SECRETS.accessToken, clientId: "client-other", sessionId: "ses_u", userId: U.id, refreshId: "rt_1", expiresAt: later, createdAt: now, scopes: ["openid", "email"] });
  await db.insert(s.oauthConsent).values({ id: "co_1", clientId: "client-other", userId: U.id, scopes: ["openid", "email"], createdAt: now, updatedAt: now });
  await db.insert(s.deviceCode).values({ id: "dc_1", deviceCode: "dev-code", userCode: "ABCD-EFGH", userId: U.id, expiresAt: later, status: "pending" });
  await db.insert(s.apikey).values({ id: "key_1", name: "Nightly export", start: "ost_abcdef", referenceId: U.id, key: SECRETS.apiKeyDigest, permissions: JSON.stringify({ "https://api.example.com": ["orders:read"] }), createdAt: now, updatedAt: now, expiresAt: later });
  // An organization key the user created: the organization's, kept with its creator cleared.
  await db.insert(s.apikey).values({ id: "key_org", configId: "organization", name: "Acme CI", start: "ost_orgkey", referenceId: "org_acme", createdBy: U.id, key: "sha256_org_key_digest", permissions: JSON.stringify({ "https://api.example.com": ["orders:read"] }), createdAt: now, updatedAt: now });
  await db.insert(s.auditLog).values([
    { id: "al_self", actorId: U.id, actorEmail: U.email, action: "api_key.create", targetType: "user", targetId: U.id, targetLabel: U.email, metadata: { name: "Nightly export" }, ipAddress: "203.0.113.5", createdAt: now },
    { id: "al_admin", actorId: OTHER.id, actorEmail: OTHER.email, action: "user.update", targetType: "user", targetId: U.id, targetLabel: U.email, metadata: { userId: U.id, data: { name: U.name, username: U.username } }, ipAddress: SECRETS.adminIp, createdAt: now },
    { id: "al_invite", actorId: OTHER.id, actorEmail: OTHER.email, action: "organization.invite", targetType: "organization", targetId: "org_acme", targetLabel: "Acme", metadata: { email: U.email.toUpperCase() }, ipAddress: SECRETS.adminIp, createdAt: now },
    { id: "al_unrelated", actorId: OTHER.id, actorEmail: OTHER.email, action: "webhook.create", targetType: "webhook", targetId: "wh_1", targetLabel: "https://hooks.example", ipAddress: SECRETS.adminIp, createdAt: now },
  ]);
  await db.insert(s.authEvent).values([
    { id: "ev_in", type: "sign_in", userId: U.id, ipAddress: "203.0.113.5", createdAt: now },
    { id: "ev_failed", type: "sign_in_failed", identifier: U.email, ipAddress: "192.0.2.9", createdAt: now },
    { id: "ev_failed_username", type: "sign_in_failed", identifier: U.username, ipAddress: "192.0.2.9", createdAt: now },
  ]);
  await db.insert(s.ssoProvider).values({ id: "sso_1", issuer: "https://idp.example", providerId: "acme-idp", domain: "acme.example", userId: U.id, organizationId: "org_acme" });
  await db.insert(s.scimSubject).values({ id: "ss_1", userId: U.id, revision: 1, createdAt: now, updatedAt: now });
  await db.insert(s.scimUser).values({
    id: "su_1", connectionId: "conn_1", provisioningDomainId: "org_acme", userId: U.id, connectionUserKey: "k1", userName: U.username, userNameKey: "unk1",
    primaryEmail: U.email, workEmailValueIndex: "w1", emailValueIndex: "e1", displayName: U.name, formattedName: U.name, serializedEmails: JSON.stringify([{ value: U.email, primary: true }]),
    externalId: "ext-1", externalIdKey: "ek1", active: true, orderKey: "o1", createdAt: now, updatedAt: now,
  });
  await db.insert(s.scimGroup).values({ id: "sg_1", connectionId: "conn_1", provisioningDomainId: "org_acme", displayName: "Engineering", displayNameKey: "dnk1", orderKey: "go1", createdAt: now, updatedAt: now });
  await db.insert(s.scimGroupMember).values({ id: "sgm_1", connectionId: "conn_1", groupId: "sg_1", scimUserId: "su_1", membershipKey: "mk1", createdAt: now });
  await db.insert(s.scimProjectionGrant).values({ id: "spg_1", connectionId: "conn_1", provisioningDomainId: "org_acme", scimUserId: "su_1", userId: U.id, sourceKind: "group", sourceId: "sg_1", role: "member", grantKey: "gk1", createdAt: now, updatedAt: now });
  await db.insert(s.scimIdentityTombstone).values({ id: "st_1", connectionId: "conn_1", provisioningDomainId: "org_acme", externalId: "ext-0", externalIdKey: "tk1", userId: U.id, profile: JSON.stringify({ email: U.email }), deletedAt: now });
  await db.insert(s.appSetting).values({ key: "api_keys", value: { enabled: true }, updatedBy: U.id });
  await db.insert(s.socialProvider).values({ id: "github", config: { clientId: "x" }, updatedBy: U.id });
  await db.insert(s.oauthClientBranding).values({ clientId: "client-other", displayName: "Notes", updatedBy: U.id });
  await db.insert(s.webhookEndpoint).values({ id: "wh_1", url: "https://hooks.example", events: ["user.updated"], secretEncrypted: "enc", createdBy: U.id });
  await db.insert(s.webhookDelivery).values([
    { id: "wd_sent", endpointId: "wh_1", eventId: "evt_1", eventType: "user.updated", status: "succeeded", payload: JSON.stringify({ id: "evt_1", type: "user.updated", timestamp: now.toISOString(), data: { user: { id: U.id, email: U.email, name: U.name } } }) },
  ]);
}

/** Every text-like column of every table, as `table.column`, with the rows where it contains `needle`. */
async function columnsContaining(needle: string): Promise<string[]> {
  const columns = await client.query<{ table_name: string; column_name: string }>(`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public' and data_type in ('text', 'jsonb', 'ARRAY', 'character varying')
  `);
  const found: string[] = [];
  for (const { table_name, column_name } of columns.rows) {
    const result = await client.query<{ n: number }>(
      `select count(*)::int as n from "${table_name}" where position(lower($1) in lower("${column_name}"::text)) > 0`,
      [needle],
    );
    if ((result.rows[0]?.n ?? 0) > 0) found.push(`${table_name}.${column_name}`);
  }
  return found.sort();
}

describe("account export", () => {
  beforeEach(async () => {
    await reset();
    await seed();
  });

  it("has every section, and no secret", async () => {
    const data = await buildAccountExport(db, U.id, { instance: "https://auth.example", now });
    expect(data).not.toBeNull();
    const json = JSON.stringify(data);
    for (const [name, secret] of Object.entries(SECRETS)) {
      expect(json.includes(secret), `${name} leaked into the export`).toBe(false);
    }
    expect(data!.profile).toMatchObject({ id: U.id, email: U.email, username: U.username });
    expect(data!.emails).toEqual([{ address: U.email, primary: true, verified: true }]);
    expect(data!.signInMethods.map((m) => m.provider).sort()).toEqual(["credential", "github"]);
    expect(data!.signInMethods.find((m) => m.provider === "credential")).toMatchObject({ kind: "password", passwordSet: true });
    expect(data!.passkeys).toEqual([expect.objectContaining({ name: "Erika's laptop", deviceType: "multiDevice", transports: ["internal", "hybrid"] })]);
    expect(data!.twoFactor).toMatchObject({ enabled: true, method: "authenticator_app" });
    expect(data!.sessions).toEqual([expect.objectContaining({ ipAddress: "203.0.113.5", userAgent: "Mozilla/5.0 (Erika)" })]);
    expect(data!.connectedApps).toEqual([
      expect.objectContaining({ clientId: "client-other", name: "Notes", consents: [expect.objectContaining({ scopes: ["openid", "email"] })] }),
    ]);
    expect(data!.connectedApps[0]!.accessTokens.issued).toBe(1);
    expect(data!.registeredApps.map((c) => [c.clientId, c.registration]).sort()).toEqual([
      ["client-console", "admin"],
      ["client-dynamic", "dynamic"],
      ["client-unmarked", "dynamic"],
    ]);
    expect(data!.apiKeys).toEqual([expect.objectContaining({ name: "Nightly export", start: "ost_abcdef", api: "https://api.example.com", scopes: ["orders:read"] })]);
    expect(data!.organizationApiKeysCreated).toEqual([expect.objectContaining({ id: "key_org", name: "Acme CI", organization: "Acme" })]);
    expect(json.includes("sha256_org_key_digest")).toBe(false);
    expect(data!.organizations.map((o) => [o.id, o.role]).sort()).toEqual([
      ["org_acme", "admin"],
      [PUBLIC_ORGANIZATION_ID, "member"],
    ]);
    expect(data!.invitations.sent).toHaveLength(1);
    expect(data!.invitations.received).toHaveLength(1);
    expect(data!.enterpriseSso.providersRegistered).toEqual([expect.objectContaining({ providerId: "acme-idp" })]);
    expect(data!.directory.provisioned).toBe(true);
    expect(data!.directory.records[0]).toMatchObject({ userName: U.username, groups: ["Engineering"] });
    // Their own entries and those about them; not unrelated ones.
    expect(data!.auditLog.map((a) => a.id).sort()).toEqual(["al_admin", "al_self"]);
    expect(data!.auditLog.find((a) => a.id === "al_admin")).toMatchObject({ by: "administrator", ipAddress: null });
    expect(data!.auditLog.find((a) => a.id === "al_self")).toMatchObject({ by: "you", ipAddress: "203.0.113.5" });
    expect(data!.signInEvents).toHaveLength(3);
    expect(data!.signInEvents.filter((e) => e.type === "sign_in_failed").every((e) => e.ipAddress === null)).toBe(true);
  });

  it("is null for an unknown account", async () => {
    expect(await buildAccountExport(db, "nobody")).toBeNull();
  });
});

describe("account deletion", () => {
  beforeEach(async () => {
    await reset();
    await seed();
  });

  it("leaves nothing that identifies the person", async () => {
    // The scan sees the seeded data, so an empty result below means something.
    expect(await columnsContaining(U.email)).toEqual(
      expect.arrayContaining(["audit_log.actor_email", "invitation.email", "scim_user.primary_email", "user.email", "webhook_delivery.payload"]),
    );
    expect((await columnsContaining(U.id)).length).toBeGreaterThan(20);

    const summary = await prepareUserErasure(db, U);
    await db.delete(schema.user).where(eq(schema.user.id, U.id));

    expect(summary.memberships.map((m) => m.id).sort()).toEqual(["mem_u_acme", "mem_u_public"]);
    expect(summary.detachedClients).toBe(1);
    expect(summary.detachedSsoProviders).toBe(1);
    expect(summary.redactedDeliveries).toBe(1);

    for (const needle of [U.email, U.username, U.name]) {
      expect(await columnsContaining(needle), `"${needle}" is still stored`).toEqual([]);
    }
    // Only the audit log keeps the id, as the pseudonymous key of the entries about this account.
    expect(await columnsContaining(U.id)).toEqual(["audit_log.metadata", "audit_log.target_id"]);
    // The 203.0.113.5 address was the person's: on their sessions (gone), events and own audit entry.
    expect(await columnsContaining("203.0.113.5")).toEqual([]);
  });

  it("keeps the instance's apps, providers and other people's records", async () => {
    await prepareUserErasure(db, U);
    await db.delete(schema.user).where(eq(schema.user.id, U.id));

    const clients = await db.select({ clientId: schema.oauthClient.clientId, userId: schema.oauthClient.userId }).from(schema.oauthClient);
    expect(clients.sort((a, b) => a.clientId.localeCompare(b.clientId))).toEqual([
      { clientId: "client-console", userId: null },
      { clientId: "client-other", userId: OTHER.id },
    ]);
    expect(await db.select({ userId: schema.ssoProvider.userId }).from(schema.ssoProvider)).toEqual([{ userId: null }]);
    expect(await db.select({ id: schema.webhookEndpoint.id }).from(schema.webhookEndpoint)).toEqual([{ id: "wh_1" }]);
    // The personal key is gone; the organization's key stays, without its creator.
    expect(await db.select({ id: schema.apikey.id, createdBy: schema.apikey.createdBy }).from(schema.apikey)).toEqual([
      { id: "key_org", createdBy: null },
    ]);

    const audits = await db.select().from(schema.auditLog);
    expect(audits).toHaveLength(4);
    const byId = Object.fromEntries(audits.map((a) => [a.id, a]));
    expect(byId.al_self).toMatchObject({ actorId: null, actorEmail: DELETED_USER_LABEL, targetLabel: DELETED_USER_LABEL, ipAddress: null });
    // An admin's entry about them keeps the admin and the admin's IP.
    expect(byId.al_admin).toMatchObject({ actorId: OTHER.id, actorEmail: OTHER.email, targetLabel: DELETED_USER_LABEL, ipAddress: SECRETS.adminIp });
    expect(byId.al_admin!.metadata).toEqual({ userId: U.id, data: { name: DELETED_USER_LABEL, username: DELETED_USER_LABEL } });
    expect(byId.al_invite!.metadata).toEqual({ email: DELETED_USER_LABEL });
    expect(byId.al_unrelated).toMatchObject({ targetLabel: "https://hooks.example", ipAddress: SECRETS.adminIp });

    // Sign-in counts survive for the charts.
    expect(await db.select({ id: schema.authEvent.id }).from(schema.authEvent)).toHaveLength(3);
    // The person's sessions are gone, and so is the one they opened by impersonating the admin.
    expect(await db.select({ id: schema.session.id }).from(schema.session)).toEqual([]);
    const delivery = JSON.parse((await db.select().from(schema.webhookDelivery))[0]!.payload);
    expect(delivery).toEqual({ id: "evt_1", type: "user.updated", timestamp: now.toISOString(), data: { redacted: true } });
  });

  it("refuses admins, sole owners and directory-managed accounts", async () => {
    // Seeded: provisioned by SCIM, not an admin, not an owner.
    expect((await accountDeletionBlockers(db, U.id)).map((b) => b.kind)).toEqual(["scim"]);
    expect((await accountDeletionBlockers(db, OTHER.id)).map((b) => b)).toEqual([
      { kind: "admin" },
      { kind: "sole_owner", organizations: [{ id: "org_acme", name: "Acme" }] },
    ]);

    await db.delete(schema.scimUser);
    await db.delete(schema.scimSubject);
    expect(await accountDeletionBlockers(db, U.id)).toEqual([]);

    // A second owner frees the first; an owner,admin role counts as owner.
    await db.update(schema.member).set({ role: "owner,admin" }).where(eq(schema.member.id, "mem_u_acme"));
    expect((await accountDeletionBlockers(db, OTHER.id)).map((b) => b.kind)).toEqual(["admin"]);
    expect(await accountDeletionBlockers(db, U.id)).toEqual([]);
  });
});

describe("scrubValue", () => {
  it("replaces every occurrence, ignoring case, and keeps untouched values", () => {
    const input = { a: "Mail ERIKA@x.org now", b: ["erika@x.org", 3], c: { d: "keep" } };
    const out = scrubValue(input, ["erika@x.org"]) as typeof input;
    expect(out).toEqual({ a: `Mail ${DELETED_USER_LABEL} now`, b: [DELETED_USER_LABEL, 3], c: { d: "keep" } });
    expect(out.c).toBe(input.c);
    const untouched = { x: "y" };
    expect(scrubValue(untouched, ["erika@x.org"])).toBe(untouched);
  });
});
