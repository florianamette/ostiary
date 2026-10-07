"use server";

import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { and, eq, gt } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { organization, ssoProvider, verification } from "@ostiary/core/db/schema";
import { adminActor } from "@/lib/admin-audit";

/*
 * SSO providers are managed here rather than through the plugin's endpoints, which only let
 * the admin who registered a provider (or an admin of its organization) change it. The DNS
 * record format matches the plugin's (tokenPrefix "ostiary"), so both stay compatible.
 */

type Result = { ok: true } | { ok: false; error: string };
const verificationIdentifier = (providerId: string) => `_ostiary-${providerId}`;

function hostnameOf(domain: string): string | null {
  try {
    return new URL(domain.includes("://") ? domain : `https://${domain}`).hostname || null;
  } catch {
    return null;
  }
}

export async function updateSsoProvider(
  providerId: string,
  input: { issuer: string; domain: string; organizationId: string | null },
): Promise<Result> {
  const { audit } = await adminActor();
  const [current] = await db.select().from(ssoProvider).where(eq(ssoProvider.providerId, providerId));
  if (!current) return { ok: false, error: "Provider not found." };
  const issuer = input.issuer.trim();
  const domain = input.domain.trim().toLowerCase();
  try {
    new URL(issuer);
  } catch {
    return { ok: false, error: "The issuer must be a URL." };
  }
  if (!hostnameOf(domain)) return { ok: false, error: "Enter an email domain, e.g. acme.com." };
  if (input.organizationId) {
    const [org] = await db.select({ id: organization.id }).from(organization).where(eq(organization.id, input.organizationId));
    if (!org) return { ok: false, error: "Organization not found." };
  }
  const domainChanged = domain !== current.domain;
  await db
    .update(ssoProvider)
    .set({ issuer, domain, organizationId: input.organizationId, ...(domainChanged ? { domainVerified: false } : {}) })
    .where(eq(ssoProvider.providerId, providerId));
  if (domainChanged) await db.delete(verification).where(eq(verification.identifier, verificationIdentifier(providerId)));
  await audit({
    action: "sso_provider.update",
    target: { type: "sso_provider", id: providerId, label: providerId },
    metadata: { issuer, domain, organizationId: input.organizationId, domainVerificationReset: domainChanged },
  });
  return { ok: true };
}

export async function deleteSsoProvider(providerId: string): Promise<Result> {
  const { audit } = await adminActor();
  const deleted = await db.delete(ssoProvider).where(eq(ssoProvider.providerId, providerId)).returning({ domain: ssoProvider.domain });
  if (deleted.length === 0) return { ok: false, error: "Provider not found." };
  await db.delete(verification).where(eq(verification.identifier, verificationIdentifier(providerId)));
  await audit({ action: "sso_provider.delete", target: { type: "sso_provider", id: providerId, label: providerId }, metadata: { domain: deleted[0]!.domain } });
  return { ok: true };
}

/** Returns the DNS TXT record the domain owner must publish (reusing an unexpired token). */
export async function getDomainVerificationRecord(
  providerId: string,
): Promise<{ ok: true; name: string; value: string } | { ok: false; error: string }> {
  await adminActor();
  const [provider] = await db.select().from(ssoProvider).where(eq(ssoProvider.providerId, providerId));
  if (!provider) return { ok: false, error: "Provider not found." };
  const hostname = hostnameOf(provider.domain);
  if (!hostname) return { ok: false, error: "The provider's domain is not valid." };
  const identifier = verificationIdentifier(providerId);
  const [active] = await db
    .select()
    .from(verification)
    .where(and(eq(verification.identifier, identifier), gt(verification.expiresAt, new Date())));
  let token = active?.value;
  if (!token) {
    token = randomBytes(18).toString("base64url");
    await db.delete(verification).where(eq(verification.identifier, identifier));
    await db.insert(verification).values({
      id: randomBytes(16).toString("hex"),
      identifier,
      value: token,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    });
  }
  return { ok: true, name: `${identifier}.${hostname}`, value: `${identifier}=${token}` };
}

/** Looks the TXT record up in DNS and marks the domain verified when it matches. */
export async function checkDomainVerification(providerId: string): Promise<Result> {
  const { audit } = await adminActor();
  const record = await getDomainVerificationRecord(providerId);
  if (!record.ok) return record;
  let found: string[] = [];
  try {
    found = (await resolveTxt(record.name)).flat();
  } catch {
    // NXDOMAIN or no TXT record yet
  }
  if (!found.some((txt) => txt.includes(record.value))) {
    return { ok: false, error: "The TXT record was not found yet. DNS changes can take a few minutes to appear." };
  }
  await db.update(ssoProvider).set({ domainVerified: true }).where(eq(ssoProvider.providerId, providerId));
  await db.delete(verification).where(eq(verification.identifier, verificationIdentifier(providerId)));
  await audit({ action: "sso_provider.verify_domain", target: { type: "sso_provider", id: providerId, label: providerId } });
  return { ok: true };
}
