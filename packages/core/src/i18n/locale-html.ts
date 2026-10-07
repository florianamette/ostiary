import type { AppLocale } from "@ostiary/core/i18n/routing";

/** BCP-47 tags for `<html lang>`; path segment `cn` maps to `zh-Hans`. */
export const localeToHtmlLang: Record<AppLocale, string> = {
  en: "en",
  fr: "fr",
  cn: "zh-Hans",
  de: "de",
  es: "es",
  it: "it",
  pt: "pt",
  nl: "nl",
  pl: "pl",
  ru: "ru",
  ja: "ja",
  ko: "ko",
  ar: "ar",
  hi: "hi",
  tr: "tr",
  sv: "sv",
  da: "da",
  no: "nb",
  fi: "fi",
  cs: "cs",
};

const rtlLocales = new Set<AppLocale>(["ar"]);

export function isRtlLocale(locale: AppLocale): boolean {
  return rtlLocales.has(locale);
}

export function getHtmlLang(locale: AppLocale): string {
  return localeToHtmlLang[locale];
}
