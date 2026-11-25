import { describe, expect, it } from "vitest";

import { promptToResume, twoFactorDeadline } from "@ostiary/core/lib/two-factor-policy";

const day = (n: number) => new Date(Date.UTC(2026, 10, n));

describe("twoFactorDeadline", () => {
  it("is nothing when nobody requires it", () => {
    expect(twoFactorDeadline({ platform: null, organization: null }, day(1), 14)).toBeNull();
  });

  it("runs the grace period from the earliest requirement, or from the account's creation if later", () => {
    expect(twoFactorDeadline({ platform: day(10), organization: day(5) }, day(1), 14)).toEqual({ deadline: day(19), source: "organization" });
    expect(twoFactorDeadline({ platform: day(10), organization: null }, day(20), 7)).toEqual({ deadline: day(27), source: "platform" });
    expect(twoFactorDeadline({ platform: null, organization: day(3) }, day(1), 0)).toEqual({ deadline: day(3), source: "organization" });
  });
});

describe("promptToResume", () => {
  it("keeps the prompt page with its signed request", () => {
    expect(promptToResume("/en/two-factor/required?client_id=x&sig=y")).toBe("/en/two-factor/required?client_id=x&sig=y");
    expect(promptToResume("/two-factor/required?a=1")).toBe("/two-factor/required?a=1");
  });

  it("refuses anything else", () => {
    for (const raw of ["https://evil.example/en/two-factor/required", "//evil.example/en/two-factor/required", "/en/dashboard", "/en/two-factor/required/../x", "javascript:alert(1)", null]) {
      expect(promptToResume(raw), String(raw)).toBeNull();
    }
  });
});
