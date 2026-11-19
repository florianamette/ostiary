import { describe, expect, it } from "vitest";

import { adminAccess } from "@ostiary/core/lib/admin/admin-access";

describe("adminAccess", () => {
  it("is signed_out without a user", () => {
    expect(adminAccess(null, true)).toBe("signed_out");
    expect(adminAccess(undefined, false)).toBe("signed_out");
  });

  it("is not_admin without the admin role", () => {
    expect(adminAccess({ role: "user" }, false)).toBe("not_admin");
    expect(adminAccess({ role: null }, false)).toBe("not_admin");
  });

  it("finds admin in a comma-separated role", () => {
    expect(adminAccess({ role: "user,admin", twoFactorEnabled: true }, true)).toBe("ok");
  });

  it("asks an admin for two-factor only when required", () => {
    expect(adminAccess({ role: "admin", twoFactorEnabled: false }, true)).toBe("needs_2fa");
    expect(adminAccess({ role: "admin", twoFactorEnabled: false }, false)).toBe("ok");
  });
});
