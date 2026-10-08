import { createHmac } from "node:crypto";
import type { DBTransactionAdapter } from "better-auth";
import type { SCIMIdentity, SCIMProjection, SCIMScope } from "@better-auth/scim";

import { userHasAdminRole } from "@ostiary/core/lib/admin/user-has-admin-role";
import { PUBLIC_ORGANIZATION_ID } from "@ostiary/core/lib/organization-public";

/*
 * SCIM 2.0 provisioning, one connection per organization. The organization id is the
 * plugin's "provisioning domain": users the identity provider pushes join that organization.
 *
 * Deprovisioning never deletes an account. Both `active: false` and DELETE leave the account
 * in place (the plugin keeps a tombstone so the same person is found again if re-provisioned);
 * once no connection has the person active, the account is banned with SCIM_DEACTIVATED_REASON,
 * its OAuth tokens are revoked and the plugin deletes its sessions. Reactivating lifts only
 * that ban, never one an admin set.
 */

/** Ban reason that marks an account deactivated by provisioning (not by an admin). */
export const SCIM_DEACTIVATED_REASON = "Deactivated by SCIM provisioning";

/** Shown at sign-in to a deactivated account. */
export const SCIM_DEACTIVATED_MESSAGE = "Your organization has deactivated this account.";

/** Every SCIM operation: users and groups, read and write. Okta and Entra use all four. */
export const SCIM_TOKEN_SCOPES: SCIMScope[] = [
  "scim.users.read",
  "scim.users.write",
  "scim.groups.read",
  "scim.groups.write",
];

/** Tokens expire after a year. Identity providers keep a token until someone pastes a new one. */
export const SCIM_TOKEN_LIFETIME_MS = 365 * 24 * 3600 * 1000;

/** The URL to paste into the identity provider ("SCIM connector base URL", "Tenant URL"). */
export function scimBaseUrl(authAppUrl: string): string {
  return `${authAppUrl.replace(/\/$/, "")}/api/auth/scim/v2`;
}

/** Organizations that can provision users. Every account is already in Public. */
export function organizationAcceptsScim(organizationId: string): boolean {
  return organizationId !== PUBLIC_ORGANIZATION_ID;
}

/**
 * Key for the HMAC digests of SCIM tokens. SCIM_TOKEN_SECRET when set, otherwise derived from
 * BETTER_AUTH_SECRET so existing deployments need no new variable. Changing either one
 * invalidates every SCIM token.
 */
export function scimCredentialHashSecret(env: { SCIM_TOKEN_SECRET?: string; BETTER_AUTH_SECRET: string }): string {
  if (env.SCIM_TOKEN_SECRET) return env.SCIM_TOKEN_SECRET;
  return createHmac("sha256", env.BETTER_AUTH_SECRET).update("ostiary:scim-credential-hash").digest("hex");
}

/** Lowercased hostnames from an SSO provider's domain field ("acme.com", "acme.com,acme.fr", or a URL). */
export function ssoDomains(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .map((part) => {
      try {
        return new URL(part.includes("://") ? part : `https://${part}`).hostname;
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

type Database = Pick<DBTransactionAdapter, "findOne" | "findMany" | "create" | "update" | "updateMany" | "deleteMany">;
type UserRow = { id: string; email: string; emailVerified: boolean; role?: string | null; banned?: boolean | null; banReason?: string | null };

/**
 * An account that already exists is linked only when the organization has proven it owns the
 * email domain (a verified SSO provider for that domain) and the address itself is verified.
 * Otherwise the plugin creates an account, or answers 409 if the email is taken: an identity
 * provider must not take over an account just by naming its address. Platform admins are
 * never linked, so no organization can deactivate them.
 */
export const scimIdentity: SCIMIdentity = {
  async resolveUser({ provisioningDomainId, resource }, { database }) {
    const email = resource.primaryEmail.trim().toLowerCase();
    const existing = await database.findOne<UserRow>({ model: "user", where: [{ field: "email", value: email }] });
    if (!existing || !existing.emailVerified || userHasAdminRole(existing.role, ["admin"])) return { action: "create" };
    const domain = email.split("@")[1] ?? "";
    const providers = await database.findMany<{ domain: string }>({
      model: "ssoProvider",
      where: [
        { field: "organizationId", value: provisioningDomainId },
        { field: "domainVerified", value: true },
      ],
    });
    if (!providers.some((p) => ssoDomains(p.domain).includes(domain))) return { action: "create" };
    // "preserve": the account keeps its own name and email; the directory only controls access.
    return { action: "link", userId: existing.id, profile: "preserve" };
  },

  async reconcileUser({ userId, active }, { database }) {
    await setScimDeactivated(database, userId, !active);
  },
};

/** Bans (or lifts the provisioning ban on) an account. Exported for tests. */
export async function setScimDeactivated(database: Database, userId: string, deactivated: boolean, now = new Date()) {
  const account = await database.findOne<UserRow>({ model: "user", where: [{ field: "id", value: userId }] });
  if (!account) return;
  if (!deactivated) {
    if (account.banned && account.banReason === SCIM_DEACTIVATED_REASON) {
      await database.update({
        model: "user",
        where: [{ field: "id", value: userId }],
        update: { banned: false, banReason: null, banExpires: null },
      });
    }
    return;
  }
  // Keep an admin's ban (and its reason) if there is one.
  if (!account.banned) {
    await database.update({
      model: "user",
      where: [{ field: "id", value: userId }],
      update: { banned: true, banReason: SCIM_DEACTIVATED_REASON, banExpires: null },
    });
  }
  // Sessions are deleted by the plugin. Access and refresh tokens outlive them, so revoke those
  // too: apps lose access at their next refresh or introspection.
  for (const model of ["oauthRefreshToken", "oauthAccessToken"]) {
    await database.updateMany({
      model,
      where: [
        { field: "userId", value: userId },
        { field: "revoked", value: null },
      ],
      update: { revoked: now },
    });
  }
  // API keys go too, as when an admin bans the account (see the user update hook).
  await database.deleteMany({ model: "apikey", where: [{ field: "referenceId", value: userId }] });
}

/**
 * Provisioned people are members of the organization. Removing them from the directory
 * (DELETE) also removes the membership, unless an admin made them owner or admin here.
 */
export const scimProjection: SCIMProjection = {
  async reconcileUser({ provisioningDomainId: organizationId, userId, sources }, { database }) {
    await syncScimMembership(database, organizationId, userId, sources.length > 0);
  },
};

/** Exported for tests. */
export async function syncScimMembership(database: Database, organizationId: string, userId: string, provisioned: boolean) {
  if (!organizationAcceptsScim(organizationId)) return;
  const org = await database.findOne<{ id: string }>({ model: "organization", where: [{ field: "id", value: organizationId }] });
  if (!org) return;
  const existing = await database.findOne<{ id: string; role: string }>({
    model: "member",
    where: [
      { field: "organizationId", value: organizationId },
      { field: "userId", value: userId },
    ],
  });
  if (provisioned && !existing) {
    await database.create({
      model: "member",
      data: { organizationId, userId, role: "member", createdAt: new Date() },
    });
  } else if (!provisioned && existing?.role === "member") {
    await database.deleteMany({ model: "member", where: [{ field: "id", value: existing.id }] });
  }
}
