import { describe, expect, it } from "vitest";

import { appTimeZone } from "@ostiary/core/i18n/constants";

describe("appTimeZone", () => {
  it("takes TZ, without POSIX's leading colon, and falls back to UTC", () => {
    expect(appTimeZone("Europe/Paris")).toBe("Europe/Paris");
    expect(appTimeZone(":UTC")).toBe("UTC");
    expect(appTimeZone(":America/New_York")).toBe("America/New_York");
    expect(appTimeZone("Not/AZone")).toBe("UTC");
    expect(appTimeZone(" ")).toBe("UTC");
    expect(appTimeZone(undefined)).toBe("UTC");
  });
});
