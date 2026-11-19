import { routing, type AppLocale } from "@ostiary/core/i18n/routing";

function isLocaleSegment(segment: string | undefined): segment is AppLocale {
  return segment !== undefined && (routing.locales as readonly string[]).includes(segment);
}

/**
 * A pathname split into its locale (the first segment when it is one, else the default) and
 * the path after it, always starting with `/`.
 */
export function splitLocalePath(pathname: string): { locale: AppLocale; restPath: string } {
  const segments = pathname.split("/").filter(Boolean);
  if (isLocaleSegment(segments[0])) {
    const rest = segments.slice(1);
    return { locale: segments[0], restPath: rest.length === 0 ? "/" : `/${rest.join("/")}` };
  }
  return { locale: routing.defaultLocale, restPath: segments.length === 0 ? "/" : `/${segments.join("/")}` };
}

/**
 * `path` (it may carry a query or a fragment) in `locale`, on `base`'s origin, with the locale
 * prefix the routing asks for: none for the default locale unless localePrefix is "always".
 */
export function localizedUrl(base: string | URL, locale: AppLocale, path: string): URL {
  const tail = path === "/" ? "" : path;
  const unprefixed = routing.localePrefix !== "always" && locale === routing.defaultLocale;
  return new URL(unprefixed ? tail || "/" : `/${locale}${tail}`, base);
}
