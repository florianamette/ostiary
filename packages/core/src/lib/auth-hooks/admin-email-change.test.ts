import { describe, expect, it } from "vitest";

import { emailVerifiedAfterAdminUpdate } from "@ostiary/core/lib/auth-hooks/admin-email-change";

describe("emailVerifiedAfterAdminUpdate", () => {
  it("marks a new address unverified", () => {
    expect(emailVerifiedAfterAdminUpdate("a@example.com", { email: "b@example.com", name: "B" })).toEqual({
      email: "b@example.com",
      name: "B",
      emailVerified: false,
    });
  });

  it("overrides an emailVerified sent along with a new address", () => {
    expect(emailVerifiedAfterAdminUpdate("a@example.com", { email: "b@example.com", emailVerified: true })).toMatchObject({
      emailVerified: false,
    });
  });

  it("keeps the verification when the address does not really change", () => {
    const same = { email: " A@Example.com ", name: "A" };
    expect(emailVerifiedAfterAdminUpdate("a@example.com", same)).toBe(same);
    const noEmail = { name: "A" };
    expect(emailVerifiedAfterAdminUpdate("a@example.com", noEmail)).toBe(noEmail);
  });
});
