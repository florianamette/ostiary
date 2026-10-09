import { describe, expect, it } from "vitest";

import { implicitLinkRefusal } from "@ostiary/core/lib/security/account-linking-policy";

describe("implicitLinkRefusal", () => {
  it("refuses to attach a new sign-in method to an account with two-factor authentication", () => {
    expect(implicitLinkRefusal({ role: "user", twoFactorEnabled: true })).toMatch(/two-factor/i);
  });

  it("refuses to attach one to a platform admin", () => {
    expect(implicitLinkRefusal({ role: "admin", twoFactorEnabled: false })).toMatch(/admin/i);
    expect(implicitLinkRefusal({ role: "user,admin", twoFactorEnabled: null })).toMatch(/admin/i);
  });

  it("allows other accounts (Better Auth still requires both emails to be verified)", () => {
    expect(implicitLinkRefusal({ role: "user", twoFactorEnabled: false })).toBeNull();
    expect(implicitLinkRefusal({ role: null })).toBeNull();
  });
});
