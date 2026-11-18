import { and, ne, sql } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { ssoProvider } from "@ostiary/core/db/schema";

/**
 * Whether an SSO provider (other than `exceptProviderId`) already claims this email domain, in
 * any letter case. Sign-in picks the provider by the email's domain, so a domain has one provider;
 * the unique index on lower(domain) refuses a second one when two registrations race.
 */
export async function ssoDomainClaimed(domain: string, exceptProviderId?: string): Promise<boolean> {
  const sameDomain = sql`lower(${ssoProvider.domain}) = ${domain.toLowerCase()}`;
  const [claimed] = await db
    .select({ id: ssoProvider.id })
    .from(ssoProvider)
    .where(exceptProviderId ? and(sameDomain, ne(ssoProvider.providerId, exceptProviderId)) : sameDomain)
    .limit(1);
  return Boolean(claimed);
}
