import { and, eq, ne, sql } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { isUniqueViolation } from "@ostiary/core/lib/api/request-checks";
import { organization, ssoProvider, verification } from "@ostiary/core/db/schema";
import { ssoDomainVerificationIdentifier } from "@ostiary/core/lib/security/sso-domain";

/*
 * What every change to an SSO provider's domain or organization goes through, OIDC or SAML,
 * from the console: the organization must exist, no other provider may claim the domain (sign-in
 * picks the provider by the email's domain), and a new domain must be verified again.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

export type SsoTargetError = "organizationNotFound" | "domainTaken";

/** Postgres refused a second provider for a domain (unique index on lower(domain)). */
export function isDomainTakenViolation(error: unknown): boolean {
  return isUniqueViolation(error, "sso_provider_domain");
}

/** Checks a provider's target: its organization exists and no other provider has the domain. */
export async function checkSsoProviderTarget(
  executor: Executor,
  target: { domain: string; organizationId: string | null; providerId?: string },
): Promise<SsoTargetError | null> {
  if (target.organizationId) {
    const [org] = await executor
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, target.organizationId));
    if (!org) return "organizationNotFound";
  }
  const sameDomain = sql`lower(${ssoProvider.domain}) = ${target.domain.toLowerCase()}`;
  const [taken] = await executor
    .select({ id: ssoProvider.id })
    .from(ssoProvider)
    .where(target.providerId ? and(sameDomain, ne(ssoProvider.providerId, target.providerId)) : sameDomain)
    .limit(1);
  return taken ? "domainTaken" : null;
}

/**
 * Saves a provider's new domain and organization, with `extra` columns (issuer, samlConfig), in
 * one transaction. A changed domain is no longer verified, and its pending DNS token goes.
 */
export async function applySsoProviderChange(
  current: { providerId: string; domain: string },
  change: { domain: string; organizationId: string | null; extra?: Partial<Pick<typeof ssoProvider.$inferInsert, "issuer" | "samlConfig">> },
): Promise<{ ok: true; domainChanged: boolean } | { ok: false; error: SsoTargetError }> {
  try {
    return await saveSsoProviderChange(current, change);
  } catch (error) {
    if (isDomainTakenViolation(error)) return { ok: false, error: "domainTaken" };
    throw error;
  }
}

async function saveSsoProviderChange(
  current: { providerId: string; domain: string },
  change: { domain: string; organizationId: string | null; extra?: Partial<Pick<typeof ssoProvider.$inferInsert, "issuer" | "samlConfig">> },
): Promise<{ ok: true; domainChanged: boolean } | { ok: false; error: SsoTargetError }> {
  return db.transaction(async (tx) => {
    const refused = await checkSsoProviderTarget(tx, { ...change, providerId: current.providerId });
    if (refused) return { ok: false as const, error: refused };
    const domainChanged = change.domain !== current.domain;
    await tx
      .update(ssoProvider)
      .set({
        ...change.extra,
        domain: change.domain,
        organizationId: change.organizationId,
        ...(domainChanged ? { domainVerified: false } : {}),
      })
      .where(eq(ssoProvider.providerId, current.providerId));
    if (domainChanged) {
      await tx.delete(verification).where(eq(verification.identifier, ssoDomainVerificationIdentifier(current.providerId)));
    }
    return { ok: true as const, domainChanged };
  });
}
