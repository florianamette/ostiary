import { describe, expect, it } from "vitest";

import {
  DEFAULT_EMAIL_DOMAIN_POLICY,
  domainInSet,
  emailDomain,
  emailDomainAllowed,
  normalizeDomainList,
  parseEmailDomainPolicy,
  type EmailDomainPolicy,
} from "@ostiary/core/lib/email-domain-policy-options";

const disposable = new Set(["mailinator.com", "trash.example"]);
const policy = (p: Partial<EmailDomainPolicy>): EmailDomainPolicy => ({ ...DEFAULT_EMAIL_DOMAIN_POLICY, ...p });

describe("normalizeDomainList", () => {
  it("accepts domains as admins paste them, once each, sorted", () => {
    expect(normalizeDomainList(["Acme.com", "@acme.com", " https://beta.io/x ", "", "acme.com."])).toEqual(["acme.com", "beta.io"]);
  });

  it("refuses an entry that is not a domain", () => {
    expect(normalizeDomainList(["acme.com", "not a domain"])).toBeNull();
    expect(normalizeDomainList(["localhost"])).toBeNull();
  });
});

describe("parseEmailDomainPolicy", () => {
  it("falls back to anyone, field by field", () => {
    expect(parseEmailDomainPolicy(undefined)).toEqual(DEFAULT_EMAIL_DOMAIN_POLICY);
    expect(parseEmailDomainPolicy({ mode: "weird", domains: "acme.com", blockDisposable: "yes" })).toEqual(DEFAULT_EMAIL_DOMAIN_POLICY);
  });

  it("reads an allow-list without domains as anyone, never as no one", () => {
    expect(parseEmailDomainPolicy({ mode: "allow", domains: [] }).mode).toBe("any");
    expect(parseEmailDomainPolicy({ mode: "allow", domains: ["ACME.com", 3] })).toEqual({ mode: "allow", domains: ["acme.com"], blockDisposable: false });
  });
});

describe("emailDomain", () => {
  it("takes what follows the last @, in lower case", () => {
    expect(emailDomain("Jane@Acme.COM")).toBe("acme.com");
    expect(emailDomain('"a@b"@acme.com')).toBe("acme.com");
    expect(emailDomain("nobody")).toBeNull();
    expect(emailDomain("@acme.com")).toBeNull();
  });
});

describe("domainInSet", () => {
  it("matches a listed domain and its subdomains, never the top-level domain alone", () => {
    expect(domainInSet("mailinator.com", disposable)).toBe(true);
    expect(domainInSet("x.mailinator.com", disposable)).toBe(true);
    expect(domainInSet("notmailinator.com", disposable)).toBe(false);
    expect(domainInSet("com", new Set(["com"]))).toBe(false);
  });
});

describe("emailDomainAllowed", () => {
  it("lets anyone in by default", () => {
    expect(emailDomainAllowed("a@mailinator.com", DEFAULT_EMAIL_DOMAIN_POLICY, disposable)).toBe(true);
  });

  it("only these domains: the listed domains and their subdomains", () => {
    const only = policy({ mode: "allow", domains: ["acme.com"] });
    expect(emailDomainAllowed("a@acme.com", only)).toBe(true);
    expect(emailDomainAllowed("a@eu.acme.com", only)).toBe(true);
    expect(emailDomainAllowed("a@acme.com.evil.io", only)).toBe(false);
    expect(emailDomainAllowed("a@notacme.com", only)).toBe(false);
    expect(emailDomainAllowed("no-domain", only)).toBe(false);
  });

  it("blocked domains, and throwaway services when that is on", () => {
    const block = policy({ mode: "block", domains: ["rival.io"], blockDisposable: true });
    expect(emailDomainAllowed("a@rival.io", block, disposable)).toBe(false);
    expect(emailDomainAllowed("a@sub.rival.io", block, disposable)).toBe(false);
    expect(emailDomainAllowed("a@mailinator.com", block, disposable)).toBe(false);
    expect(emailDomainAllowed("a@gmail.com", block, disposable)).toBe(true);
    // Throwaway services alone, with "anyone" otherwise.
    expect(emailDomainAllowed("a@trash.example", policy({ blockDisposable: true }), disposable)).toBe(false);
    expect(emailDomainAllowed("a@acme.com", policy({ blockDisposable: true }), disposable)).toBe(true);
  });
});
