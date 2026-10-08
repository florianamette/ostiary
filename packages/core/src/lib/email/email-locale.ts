import { locales, routing, type AppLocale } from "@ostiary/core/i18n/routing";

const isLocale = (value: string | undefined): value is AppLocale =>
  value !== undefined && (locales as readonly string[]).includes(value);

/** A browser language tag (`fr-CA`, `zh-Hans`, `nb`) as one of the app's locales, if any. */
function fromLanguageTag(tag: string): AppLocale | undefined {
  const primary = tag.trim().toLowerCase().split("-")[0];
  if (primary === "zh") return "cn";
  if (primary === "nb" || primary === "nn") return "no";
  return isLocale(primary) ? primary : undefined;
}

/**
 * The language to write an email in, for an email sent while handling a browser request: the
 * locale of the page that sent the request (every page path starts with it), then next-intl's
 * locale cookie, then the browser's languages, then the default locale.
 */
export function emailLocale(headers: Headers | undefined): AppLocale {
  if (!headers) return routing.defaultLocale;

  const referer = headers.get("referer");
  if (referer) {
    try {
      const segment = new URL(referer).pathname.split("/")[1];
      if (isLocale(segment)) return segment;
    } catch {
      // Not a URL: fall through to the other hints.
    }
  }

  const cookie = headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === "NEXT_LOCALE")?.[1];
  if (isLocale(cookie)) return cookie;

  const accepted = (headers.get("accept-language") ?? "")
    .split(",")
    .map((entry) => {
      const [tag, ...params] = entry.split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { tag, q: q ? Number(q.slice(2)) || 0 : 1 };
    })
    .filter(({ tag, q }) => tag.trim() && q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of accepted) {
    const locale = fromLanguageTag(tag);
    if (locale) return locale;
  }

  return routing.defaultLocale;
}
