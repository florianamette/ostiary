import { and, asc, count, desc, eq, inArray, max, min, or, sql } from "drizzle-orm";

import {
  account,
  apikey,
  auditLog,
  authEvent,
  invitation,
  member,
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
  organization,
  passkey,
  scimGroup,
  scimGroupMember,
  scimProjectionGrant,
  scimSubject,
  scimUser,
  session,
  ssoProvider,
  twoFactor,
  user,
} from "@ostiary/core/db/schema";
import type { Database } from "@ostiary/core/lib/account-data/database";
import { parseKeyGrant } from "@ostiary/core/lib/api-key-policy";
import { registrationSource } from "@ostiary/core/lib/client-registration-policy";

/*
 * "Export my data" (GDPR articles 15 and 20): everything Ostiary holds about one account, as one
 * JSON document. Each section lists the columns it copies, so a new column (a token, a secret)
 * never reaches an export by itself. Never included: password hashes, OAuth and session tokens,
 * provider tokens, two-factor secrets and backup codes, passkey public keys and credential IDs,
 * API keys or their digests, client secrets, and other people's IP addresses. The README's
 * "Your data" section maps every table to what the export takes from it.
 */

export const ACCOUNT_EXPORT_FORMAT = "ostiary.account-export";
export const ACCOUNT_EXPORT_VERSION = 1;

/** Upper bound per history section, so one export stays a reasonable download. */
export const EXPORT_HISTORY_LIMIT = 5000;

const iso = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : null);

function parseJson(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export type AccountExport = Awaited<ReturnType<typeof collect>>;

/** The export for one account, or null when there is no such account. */
export async function buildAccountExport(
  db: Database,
  userId: string,
  options: { instance?: string | null; now?: Date } = {},
): Promise<AccountExport | null> {
  const [u] = await db.select().from(user).where(eq(user.id, userId));
  if (!u) return null;
  return collect(db, u, options);
}

async function collect(db: Database, u: typeof user.$inferSelect, options: { instance?: string | null; now?: Date }) {
  const userId = u.id;
  const identifiers = [u.email.toLowerCase(), ...(u.username ? [u.username.toLowerCase()] : [])];

  const [
    accounts,
    ssoProviderIds,
    passkeys,
    [factor],
    sessions,
    consents,
    refreshTokens,
    accessTokenSummary,
    ownClients,
    keys,
    orgKeysCreated,
    memberships,
    invitationsSent,
    invitationsReceived,
    registeredSso,
    scimUsers,
    [subject],
    audits,
    events,
  ] = await Promise.all([
    db
      .select({
        providerId: account.providerId,
        accountId: account.accountId,
        scope: account.scope,
        password: account.password,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      })
      .from(account)
      .where(eq(account.userId, userId))
      .orderBy(asc(account.createdAt)),
    db.select({ providerId: ssoProvider.providerId }).from(ssoProvider),
    db
      .select({
        id: passkey.id,
        name: passkey.name,
        deviceType: passkey.deviceType,
        backedUp: passkey.backedUp,
        transports: passkey.transports,
        aaguid: passkey.aaguid,
        createdAt: passkey.createdAt,
      })
      .from(passkey)
      .where(eq(passkey.userId, userId))
      .orderBy(asc(passkey.createdAt)),
    db
      .select({ verified: twoFactor.verified, lockedUntil: twoFactor.lockedUntil })
      .from(twoFactor)
      .where(eq(twoFactor.userId, userId))
      .limit(1),
    db
      .select({
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        expiresAt: session.expiresAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        impersonatedBy: session.impersonatedBy,
        activeOrganizationId: session.activeOrganizationId,
      })
      .from(session)
      .where(eq(session.userId, userId))
      .orderBy(desc(session.updatedAt)),
    db
      .select({
        clientId: oauthConsent.clientId,
        scopes: oauthConsent.scopes,
        resources: oauthConsent.resources,
        createdAt: oauthConsent.createdAt,
        updatedAt: oauthConsent.updatedAt,
      })
      .from(oauthConsent)
      .where(eq(oauthConsent.userId, userId)),
    db
      .select({
        clientId: oauthRefreshToken.clientId,
        scopes: oauthRefreshToken.scopes,
        resources: oauthRefreshToken.resources,
        createdAt: oauthRefreshToken.createdAt,
        expiresAt: oauthRefreshToken.expiresAt,
        revoked: oauthRefreshToken.revoked,
      })
      .from(oauthRefreshToken)
      .where(eq(oauthRefreshToken.userId, userId))
      .orderBy(desc(oauthRefreshToken.createdAt))
      .limit(EXPORT_HISTORY_LIMIT),
    db
      .select({
        clientId: oauthAccessToken.clientId,
        issued: count(),
        first: min(oauthAccessToken.createdAt),
        last: max(oauthAccessToken.createdAt),
      })
      .from(oauthAccessToken)
      .where(eq(oauthAccessToken.userId, userId))
      .groupBy(oauthAccessToken.clientId),
    db
      .select({
        clientId: oauthClient.clientId,
        name: oauthClient.name,
        uri: oauthClient.uri,
        redirectUris: oauthClient.redirectUris,
        scopes: oauthClient.scopes,
        grantTypes: oauthClient.grantTypes,
        disabled: oauthClient.disabled,
        createdAt: oauthClient.createdAt,
        clientDiscoveryId: oauthClient.clientDiscoveryId,
        metadata: oauthClient.metadata,
        adminRegistered: oauthClient.adminRegistered,
      })
      .from(oauthClient)
      .where(eq(oauthClient.userId, userId)),
    db
      .select({
        id: apikey.id,
        name: apikey.name,
        start: apikey.start,
        permissions: apikey.permissions,
        enabled: apikey.enabled,
        requestCount: apikey.requestCount,
        lastRequest: apikey.lastRequest,
        expiresAt: apikey.expiresAt,
        createdAt: apikey.createdAt,
      })
      .from(apikey)
      .where(eq(apikey.userId, userId))
      .orderBy(asc(apikey.createdAt)),
    // Organization keys this person created belong to the organization: only that they made them.
    db
      .select({
        id: apikey.id,
        name: apikey.name,
        organizationId: apikey.organizationId,
        organization: organization.name,
        createdAt: apikey.createdAt,
      })
      .from(apikey)
      .innerJoin(organization, eq(organization.id, apikey.organizationId))
      .where(eq(apikey.createdBy, userId))
      .orderBy(asc(apikey.createdAt)),
    db
      .select({
        organizationId: organization.id,
        name: organization.name,
        slug: organization.slug,
        role: member.role,
        joinedAt: member.createdAt,
      })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(eq(member.userId, userId))
      .orderBy(asc(member.createdAt)),
    db
      .select({
        organization: organization.name,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
      })
      .from(invitation)
      .innerJoin(organization, eq(organization.id, invitation.organizationId))
      .where(eq(invitation.inviterId, userId)),
    db
      .select({
        organization: organization.name,
        role: invitation.role,
        status: invitation.status,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
      })
      .from(invitation)
      .innerJoin(organization, eq(organization.id, invitation.organizationId))
      .where(sql`lower(${invitation.email}) = ${u.email.toLowerCase()}`),
    db
      .select({
        providerId: ssoProvider.providerId,
        issuer: ssoProvider.issuer,
        domain: ssoProvider.domain,
        organizationId: ssoProvider.organizationId,
        domainVerified: ssoProvider.domainVerified,
      })
      .from(ssoProvider)
      .where(eq(ssoProvider.userId, userId)),
    db
      .select({
        id: scimUser.id,
        organizationId: scimUser.provisioningDomainId,
        userName: scimUser.userName,
        displayName: scimUser.displayName,
        givenName: scimUser.givenName,
        familyName: scimUser.familyName,
        emails: scimUser.serializedEmails,
        externalId: scimUser.externalId,
        active: scimUser.active,
        createdAt: scimUser.createdAt,
        updatedAt: scimUser.updatedAt,
      })
      .from(scimUser)
      .where(eq(scimUser.userId, userId)),
    db
      .select({ createdAt: scimSubject.createdAt, updatedAt: scimSubject.updatedAt })
      .from(scimSubject)
      .where(eq(scimSubject.userId, userId))
      .limit(1),
    db
      .select({
        id: auditLog.id,
        actorId: auditLog.actorId,
        action: auditLog.action,
        targetType: auditLog.targetType,
        targetId: auditLog.targetId,
        targetLabel: auditLog.targetLabel,
        metadata: auditLog.metadata,
        ipAddress: auditLog.ipAddress,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .where(or(eq(auditLog.actorId, userId), and(eq(auditLog.targetType, "user"), eq(auditLog.targetId, userId))))
      .orderBy(desc(auditLog.createdAt))
      .limit(EXPORT_HISTORY_LIMIT),
    db
      .select({ type: authEvent.type, userId: authEvent.userId, ipAddress: authEvent.ipAddress, createdAt: authEvent.createdAt })
      .from(authEvent)
      .where(
        or(
          eq(authEvent.userId, userId),
          and(eq(authEvent.type, "sign_in_failed"), inArray(sql<string>`lower(${authEvent.identifier})`, identifiers)),
        ),
      )
      .orderBy(desc(authEvent.createdAt))
      .limit(EXPORT_HISTORY_LIMIT),
  ]);

  // Names of the apps this account is connected to.
  const clientIds = [...new Set([...consents, ...refreshTokens, ...accessTokenSummary].map((r) => r.clientId))];
  const clients = clientIds.length
    ? await db
        .select({ clientId: oauthClient.clientId, name: oauthClient.name, uri: oauthClient.uri })
        .from(oauthClient)
        .where(inArray(oauthClient.clientId, clientIds))
    : [];

  const groups = scimUsers.length
    ? await db
        .select({ scimUserId: scimGroupMember.scimUserId, displayName: scimGroup.displayName })
        .from(scimGroupMember)
        .innerJoin(scimGroup, eq(scimGroup.id, scimGroupMember.groupId))
        .where(inArray(scimGroupMember.scimUserId, scimUsers.map((s) => s.id)))
    : [];
  const grants = scimUsers.length
    ? await db
        .select({ scimUserId: scimProjectionGrant.scimUserId, role: scimProjectionGrant.role, sourceKind: scimProjectionGrant.sourceKind })
        .from(scimProjectionGrant)
        .where(eq(scimProjectionGrant.userId, userId))
    : [];

  const ssoIds = new Set(ssoProviderIds.map((p) => p.providerId));
  const signInMethods = accounts.map((a) => ({
    provider: a.providerId,
    kind: a.providerId === "credential" ? "password" : ssoIds.has(a.providerId) ? "enterprise_sso" : "social",
    // For a password the account id is this account's own id; for others, the id the provider uses.
    accountId: a.accountId,
    ...(a.providerId === "credential" ? { passwordSet: Boolean(a.password) } : { scopes: a.scope ? a.scope.split(/[\s,]+/).filter(Boolean) : [] }),
    linkedAt: iso(a.createdAt),
    updatedAt: iso(a.updatedAt),
  }));

  const connectedApps = clientIds.map((clientId) => {
    const client = clients.find((c) => c.clientId === clientId);
    const accessTokens = accessTokenSummary.find((a) => a.clientId === clientId);
    return {
      clientId,
      name: client?.name ?? null,
      uri: client?.uri ?? null,
      consents: consents
        .filter((c) => c.clientId === clientId)
        .map((c) => ({ scopes: c.scopes, resources: c.resources ?? [], grantedAt: iso(c.createdAt), updatedAt: iso(c.updatedAt) })),
      refreshTokens: refreshTokens
        .filter((r) => r.clientId === clientId)
        .map((r) => ({ scopes: r.scopes, resources: r.resources ?? [], issuedAt: iso(r.createdAt), expiresAt: iso(r.expiresAt), revokedAt: iso(r.revoked) })),
      accessTokens: accessTokens
        ? { issued: accessTokens.issued, firstIssuedAt: iso(accessTokens.first), lastIssuedAt: iso(accessTokens.last) }
        : { issued: 0, firstIssuedAt: null, lastIssuedAt: null },
    };
  });

  return {
    format: ACCOUNT_EXPORT_FORMAT,
    version: ACCOUNT_EXPORT_VERSION,
    exportedAt: (options.now ?? new Date()).toISOString(),
    instance: options.instance ?? null,
    notes: [
      "Everything this sign-in service stores about your account, as of exportedAt.",
      "Never included, by design: your password (only a one-way hash is stored), session and OAuth tokens, tokens from linked providers, two-factor secrets and backup codes, passkey keys, API keys, and other people's IP addresses.",
      `History sections hold at most ${EXPORT_HISTORY_LIMIT} entries each, newest first.`,
    ],
    profile: {
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: u.emailVerified,
      username: u.username,
      displayUsername: u.displayUsername,
      image: u.image,
      role: u.role,
      banned: Boolean(u.banned),
      banReason: u.banned ? u.banReason : null,
      banExpires: iso(u.banExpires),
      createdAt: iso(u.createdAt),
      updatedAt: iso(u.updatedAt),
    },
    emails: [{ address: u.email, primary: true, verified: u.emailVerified }],
    signInMethods,
    passkeys: passkeys.map((p) => ({
      id: p.id,
      name: p.name,
      deviceType: p.deviceType,
      backedUp: p.backedUp,
      transports: p.transports ? p.transports.split(",").filter(Boolean) : [],
      authenticatorModel: p.aaguid,
      createdAt: iso(p.createdAt),
    })),
    twoFactor: {
      enabled: Boolean(u.twoFactorEnabled),
      method: factor ? "authenticator_app" : null,
      backupCodes: factor ? "configured (not exported)" : null,
      lockedUntil: iso(factor?.lockedUntil),
    },
    sessions: sessions.map((s) => ({
      createdAt: iso(s.createdAt),
      lastActiveAt: iso(s.updatedAt),
      expiresAt: iso(s.expiresAt),
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      openedByAdministrator: Boolean(s.impersonatedBy),
      activeOrganizationId: s.activeOrganizationId,
    })),
    connectedApps,
    registeredApps: ownClients.map((c) => ({
      clientId: c.clientId,
      name: c.name,
      uri: c.uri,
      redirectUris: c.redirectUris,
      scopes: c.scopes ?? [],
      grantTypes: c.grantTypes ?? [],
      disabled: Boolean(c.disabled),
      registration: registrationSource(c),
      createdAt: iso(c.createdAt),
    })),
    apiKeys: keys.map((k) => {
      const grant = parseKeyGrant(k.permissions);
      return {
        id: k.id,
        name: k.name,
        // The first characters only, as the dashboard shows them; the key itself is never stored.
        start: k.start,
        api: grant?.api ?? null,
        scopes: grant?.scopes ?? [],
        enabled: k.enabled !== false,
        requests: k.requestCount ?? 0,
        lastUsedAt: iso(k.lastRequest),
        expiresAt: iso(k.expiresAt),
        createdAt: iso(k.createdAt),
      };
    }),
    organizationApiKeysCreated: orgKeysCreated.map((k) => ({
      id: k.id,
      name: k.name,
      organizationId: k.organizationId,
      organization: k.organization,
      createdAt: iso(k.createdAt),
    })),
    organizations: memberships.map((m) => ({
      id: m.organizationId,
      name: m.name,
      slug: m.slug,
      role: m.role,
      joinedAt: iso(m.joinedAt),
    })),
    invitations: {
      sent: invitationsSent.map((i) => ({ ...i, createdAt: iso(i.createdAt), expiresAt: iso(i.expiresAt) })),
      received: invitationsReceived.map((i) => ({ ...i, createdAt: iso(i.createdAt), expiresAt: iso(i.expiresAt) })),
    },
    enterpriseSso: {
      providersRegistered: registeredSso,
    },
    directory: {
      provisioned: Boolean(subject) || scimUsers.length > 0,
      since: iso(subject?.createdAt),
      records: scimUsers.map((s) => ({
        organizationId: s.organizationId,
        userName: s.userName,
        displayName: s.displayName,
        givenName: s.givenName,
        familyName: s.familyName,
        emails: parseJson(s.emails),
        externalId: s.externalId,
        active: s.active,
        groups: groups.filter((g) => g.scimUserId === s.id).map((g) => g.displayName),
        roles: grants.filter((g) => g.scimUserId === s.id).map((g) => ({ role: g.role, from: g.sourceKind })),
        createdAt: iso(s.createdAt),
        updatedAt: iso(s.updatedAt),
      })),
    },
    auditLog: audits.map((a) => {
      const self = a.actorId === userId;
      return {
        id: a.id,
        at: iso(a.createdAt),
        action: a.action,
        by: self ? "you" : a.actorId ? "administrator" : "system",
        target: a.targetType ? { type: a.targetType, id: a.targetId, label: a.targetLabel } : null,
        details: a.metadata ?? null,
        // An administrator's address is theirs, not yours.
        ipAddress: self ? a.ipAddress : null,
      };
    }),
    signInEvents: events.map((e) => ({
      type: e.type,
      at: iso(e.createdAt),
      // A failed sign-in with your email or username may come from someone else, whose address
      // is not yours to receive: only the time is exported.
      ipAddress: e.type === "sign_in_failed" ? null : e.ipAddress,
    })),
  };
}

/** File name for a download: `ostiary-account-<id>-<date>.json`. */
export function accountExportFileName(userId: string, now = new Date()): string {
  const safe = userId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "account";
  return `ostiary-account-${safe}-${now.toISOString().slice(0, 10)}.json`;
}
