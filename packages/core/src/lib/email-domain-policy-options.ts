import { normalizeHost } from "@ostiary/core/lib/dns-name";

/*
 * Which email domains may create an account: anyone (the default), only listed domains (a
 * company's own Ostiary), or anyone but listed domains, optionally also throwaway-email services.
 * No database, so the admin console's client components can import it. Loading, saving and
 * enforcing: email-domain-policy.ts.
 */

export const EMAIL_DOMAIN_MODES = ["any", "allow", "block"] as const;
export type EmailDomainMode = (typeof EMAIL_DOMAIN_MODES)[number];

/** Listed domains, at most: the console shows them all. */
export const MAX_EMAIL_DOMAINS = 500;

export type EmailDomainPolicy = {
  mode: EmailDomainMode;
  /** Lower-case DNS names; each also covers its subdomains. */
  domains: string[];
  /** Also refuse known throwaway-email services (any mode but "allow"). */
  blockDisposable: boolean;
};

export const DEFAULT_EMAIL_DOMAIN_POLICY: EmailDomainPolicy = { mode: "any", domains: [], blockDisposable: false };

/** Each entry as a domain (a pasted `@acme.com`, URL or upper case is accepted), duplicates removed. Null: one is not a domain. */
export function normalizeDomainList(raw: readonly string[]): string[] | null {
  const out = new Set<string>();
  for (const entry of raw) {
    const trimmed = entry.trim().replace(/^@/, "");
    if (!trimmed) continue;
    const host = normalizeHost(trimmed);
    if (!host) return null;
    out.add(host);
  }
  return [...out].sort();
}

/** The stored policy, falling back to the defaults field by field: never more restrictive by accident. */
export function parseEmailDomainPolicy(raw: unknown): EmailDomainPolicy {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const mode = (EMAIL_DOMAIN_MODES as readonly unknown[]).includes(value.mode) ? (value.mode as EmailDomainMode) : "any";
  const listed = Array.isArray(value.domains) ? value.domains.filter((d): d is string => typeof d === "string") : [];
  const domains = (listed.map((d) => normalizeHost(d)).filter(Boolean) as string[]).slice(0, MAX_EMAIL_DOMAINS);
  const policy: EmailDomainPolicy = { mode, domains: [...new Set(domains)].sort(), blockDisposable: value.blockDisposable === true };
  // "Only these domains" with none listed would refuse everyone: read as "anyone".
  if (policy.mode === "allow" && policy.domains.length === 0) policy.mode = "any";
  return policy;
}

/** The domain of an address (after the last @), lower case. Null when there is none. */
export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase().replace(/\.$/, "");
  return domain || null;
}

/** Whether `domain` is one of `listed` or a subdomain of one. */
export function domainListed(domain: string, listed: Iterable<string>): boolean {
  for (const entry of listed) {
    if (domain === entry || domain.endsWith(`.${entry}`)) return true;
  }
  return false;
}

/** Whether `domain` or one of its parent domains is in `set` (the throwaway-email list). */
export function domainInSet(domain: string, set: ReadonlySet<string>): boolean {
  const labels = domain.split(".");
  // Never the top-level domain alone.
  for (let i = 0; i < labels.length - 1; i++) {
    if (set.has(labels.slice(i).join("."))) return true;
  }
  return false;
}

/**
 * Whether an address may be used for a new account (or as a new address) under the policy.
 * `disposable` is the throwaway-email list, needed only when `blockDisposable` is on.
 */
export function emailDomainAllowed(email: string, policy: EmailDomainPolicy, disposable?: ReadonlySet<string>): boolean {
  if (policy.mode === "any" && !policy.blockDisposable) return true;
  const domain = emailDomain(email);
  if (!domain) return false;
  if (policy.mode === "allow") return domainListed(domain, policy.domains);
  if (policy.mode === "block" && domainListed(domain, policy.domains)) return false;
  if (policy.blockDisposable && disposable && domainInSet(domain, disposable)) return false;
  return true;
}
