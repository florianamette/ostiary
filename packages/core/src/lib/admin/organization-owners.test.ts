import { describe, expect, it } from "vitest";

import { leavesNoOwner, memberHasRole } from "@ostiary/core/lib/admin/organization-owners";

describe("memberHasRole", () => {
  it("reads comma-separated roles", () => {
    expect(memberHasRole("owner", "owner")).toBe(true);
    expect(memberHasRole("admin, owner", "owner")).toBe(true);
    expect(memberHasRole("co-owner", "owner")).toBe(false);
    expect(memberHasRole(null, "owner")).toBe(false);
  });
});

describe("leavesNoOwner", () => {
  it("refuses removing or demoting the only owner", () => {
    expect(leavesNoOwner("owner", null, 0)).toBe(true);
    expect(leavesNoOwner("owner", "admin", 0)).toBe(true);
  });

  it("allows it when another owner remains, or the member stays an owner", () => {
    expect(leavesNoOwner("owner", null, 1)).toBe(false);
    expect(leavesNoOwner("owner", "owner", 0)).toBe(false);
    expect(leavesNoOwner("owner", "admin,owner", 0)).toBe(false);
  });

  it("ignores members who are not owners", () => {
    expect(leavesNoOwner("member", null, 0)).toBe(false);
    expect(leavesNoOwner("admin", "member", 0)).toBe(false);
  });
});
