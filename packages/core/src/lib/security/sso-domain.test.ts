import { describe, expect, it } from "vitest";

import { isStrictSsoDomain, parseSsoDomain } from "@ostiary/core/lib/security/sso-domain";

describe("parseSsoDomain", () => {
  it("accepts a plain hostname, lowercased and trimmed", () => {
    expect(parseSsoDomain("acme.com")).toBe("acme.com");
    expect(parseSsoDomain("  Mail.ACME.co.uk ")).toBe("mail.acme.co.uk");
    expect(parseSsoDomain("xn--bcher-kva.example")).toBe("xn--bcher-kva.example");
    expect(parseSsoDomain("e2e.test")).toBe("e2e.test");
  });

  it("refuses anything two URL parsers could read differently", () => {
    for (const value of [
      "attacker.com\\@victim.com",
      "attacker.com@victim.com",
      "https://acme.com",
      "acme.com/",
      "acme.com:443",
      "acme.com?x",
      "acme.com#x",
      "acme .com",
      "acme\t.com",
      "a.com,b.com",
      "%61cme.com",
    ]) {
      expect(parseSsoDomain(value), value).toBeNull();
    }
  });

  it("refuses names that are not email domains", () => {
    for (const value of ["", "localhost", "acme", "-acme.com", "acme-.com", "acme..com", ".acme.com", "acme.com.", "127.0.0.1", "acme.c0m1", `${"a".repeat(64)}.com`]) {
      expect(parseSsoDomain(value), value).toBeNull();
    }
  });
});

describe("isStrictSsoDomain", () => {
  it("is true only for a stored value that is already canonical", () => {
    expect(isStrictSsoDomain("acme.com")).toBe(true);
    expect(isStrictSsoDomain("ACME.com")).toBe(false);
    expect(isStrictSsoDomain("attacker.com\\@victim.com")).toBe(false);
    expect(isStrictSsoDomain(null)).toBe(false);
  });
});
