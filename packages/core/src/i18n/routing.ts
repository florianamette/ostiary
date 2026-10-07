import { defineRouting } from "next-intl/routing";

export const locales = [
  "en",
  "fr",
  "cn",
  "de",
  "es",
  "it",
  "pt",
  "nl",
  "pl",
  "ru",
  "ja",
  "ko",
  "ar",
  "hi",
  "tr",
  "sv",
  "da",
  "no",
  "fi",
  "cs",
] as const;
export type AppLocale = (typeof locales)[number];

export const routing = defineRouting({
  locales: [...locales],
  defaultLocale: "en",
  localePrefix: "always",
});
