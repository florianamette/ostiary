import { describe, expect, it } from "vitest";

import { localizedUrl, splitLocalePath } from "@ostiary/core/i18n/locale-path";

describe("splitLocalePath", () => {
  it("reads the locale prefix", () => {
    expect(splitLocalePath("/fr/dashboard/apps")).toEqual({ locale: "fr", restPath: "/dashboard/apps" });
    expect(splitLocalePath("/de")).toEqual({ locale: "de", restPath: "/" });
  });

  it("falls back to the default locale", () => {
    expect(splitLocalePath("/")).toEqual({ locale: "en", restPath: "/" });
    expect(splitLocalePath("/login")).toEqual({ locale: "en", restPath: "/login" });
    expect(splitLocalePath("/xx/login")).toEqual({ locale: "en", restPath: "/xx/login" });
  });
});

describe("localizedUrl", () => {
  it("prefixes the locale and keeps the query and fragment", () => {
    expect(localizedUrl("https://auth.example.com", "fr", "/login?callbackURL=%2Fx").href).toBe(
      "https://auth.example.com/fr/login?callbackURL=%2Fx",
    );
    expect(localizedUrl("https://auth.example.com/any/path", "en", "/dashboard#two-factor").href).toBe(
      "https://auth.example.com/en/dashboard#two-factor",
    );
    expect(localizedUrl("https://auth.example.com", "en", "/").href).toBe("https://auth.example.com/en");
  });
});
