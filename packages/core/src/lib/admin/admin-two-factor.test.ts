import { describe, expect, it } from "vitest";

import { adminNeedsTwoFactor } from "@ostiary/core/lib/admin/admin-two-factor";

describe("adminNeedsTwoFactor", () => {
  it("asks an admin without 2FA to set it up", () => {
    expect(adminNeedsTwoFactor({ role: "admin", twoFactorEnabled: false }, true)).toBe(true);
    expect(adminNeedsTwoFactor({ role: "user,admin", twoFactorEnabled: null }, true)).toBe(true);
  });

  it("lets an admin with 2FA through", () => {
    expect(adminNeedsTwoFactor({ role: "admin", twoFactorEnabled: true }, true)).toBe(false);
  });

  it("never applies to other users", () => {
    expect(adminNeedsTwoFactor({ role: "user", twoFactorEnabled: false }, true)).toBe(false);
    expect(adminNeedsTwoFactor({ role: null }, true)).toBe(false);
    expect(adminNeedsTwoFactor(null, true)).toBe(false);
  });

  it("is off when the deployment does not require it", () => {
    expect(adminNeedsTwoFactor({ role: "admin", twoFactorEnabled: false }, false)).toBe(false);
  });
});
