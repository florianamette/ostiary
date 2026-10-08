import { describe, expect, it } from "vitest";

import { emailLocale } from "@ostiary/core/lib/email/email-locale";

const h = (init: Record<string, string>) => new Headers(init);

describe("emailLocale", () => {
  it("uses the locale of the page that asked", () => {
    expect(emailLocale(h({ referer: "https://auth.example.com/fr/login?client_id=x", "accept-language": "de" }))).toBe("fr");
  });

  it("falls back to the next-intl cookie, then the browser's languages", () => {
    expect(emailLocale(h({ referer: "https://auth.example.com/api/auth/x", cookie: "a=1; NEXT_LOCALE=ja" }))).toBe("ja");
    expect(emailLocale(h({ "accept-language": "xx-YY, pt-BR;q=0.8, en;q=0.5" }))).toBe("pt");
  });

  it("orders browser languages by quality and maps Chinese and Norwegian", () => {
    expect(emailLocale(h({ "accept-language": "en;q=0.2, zh-Hans;q=0.9" }))).toBe("cn");
    expect(emailLocale(h({ "accept-language": "nb-NO" }))).toBe("no");
    expect(emailLocale(h({ "accept-language": "de;q=0, it" }))).toBe("it");
  });

  it("defaults to English", () => {
    expect(emailLocale(undefined)).toBe("en");
    expect(emailLocale(h({ referer: "not a url", cookie: "NEXT_LOCALE=zz" }))).toBe("en");
  });
});
