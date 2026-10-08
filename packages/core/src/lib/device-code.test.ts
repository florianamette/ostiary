import { describe, expect, it } from "vitest";

import { formatUserCode, normalizeUserCode } from "@ostiary/core/lib/device-code";

describe("normalizeUserCode", () => {
  it("drops separators and spaces and upper-cases", () => {
    expect(normalizeUserCode(" abcd-efgh ")).toBe("ABCDEFGH");
    expect(normalizeUserCode("AB CD EF GH")).toBe("ABCDEFGH");
  });

  it("keeps at most 8 characters", () => {
    expect(normalizeUserCode("ABCD-EFGH-XYZ")).toBe("ABCDEFGH");
  });

  it("returns an empty string for nothing usable", () => {
    expect(normalizeUserCode("--")).toBe("");
  });
});

describe("formatUserCode", () => {
  it("adds the dash in the middle", () => {
    expect(formatUserCode("ABCDEFGH")).toBe("ABCD-EFGH");
  });

  it("formats partial input while typing", () => {
    expect(formatUserCode("ABC")).toBe("ABC");
    expect(formatUserCode("ABCD")).toBe("ABCD");
    expect(formatUserCode("ABCDE")).toBe("ABCD-E");
  });
});
