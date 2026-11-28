import { describe, expect, it } from "vitest";

import { countryAllowed, isCountryCode, normalizeCountryList, parseCountryPolicy } from "@ostiary/core/lib/country-policy-options";

describe("country policy options", () => {
  it("accepts real country codes only", () => {
    expect(isCountryCode("FR")).toBe(true);
    expect(isCountryCode("us")).toBe(true);
    for (const code of ["XX", "T1", "EU", "ZZ", "FRA", "F", ""]) expect(isCountryCode(code), code).toBe(false);
  });

  it("normalizes a list, and refuses one with an unknown code", () => {
    expect(normalizeCountryList(["us", "FR", " fr ", ""])).toEqual(["FR", "US"]);
    expect(normalizeCountryList(["FR", "France"])).toBeNull();
  });

  it("reads a stored policy, and an empty allow list as no restriction", () => {
    expect(parseCountryPolicy({ mode: "block", countries: ["ru", "KP"] })).toEqual({ mode: "block", countries: ["KP", "RU"] });
    expect(parseCountryPolicy({ mode: "allow", countries: [] })).toEqual({ mode: "any", countries: [] });
    expect(parseCountryPolicy("nonsense")).toEqual({ mode: "any", countries: [] });
  });

  it("decides by mode, and lets an unknown country through", () => {
    const allow = { mode: "allow" as const, countries: ["FR"] };
    const block = { mode: "block" as const, countries: ["FR"] };
    expect(countryAllowed("FR", allow)).toBe(true);
    expect(countryAllowed("DE", allow)).toBe(false);
    expect(countryAllowed("fr", block)).toBe(false);
    expect(countryAllowed("DE", block)).toBe(true);
    expect(countryAllowed(null, allow)).toBe(true);
  });
});
