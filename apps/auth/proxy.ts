import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";

import { env } from "@ostiary/core/lib/env";
import { auth } from "@/lib/auth";
import type { AppLocale } from "@ostiary/core/i18n/routing";
import { routing } from "@ostiary/core/i18n/routing";

const handleI18n = createMiddleware(routing);

/**
 * Where a signed-in visitor of /login or /signup should go: the requested callbackURL when it
 * is a path on this app or a page of the admin app, otherwise the dashboard.
 */
function signedInDestination(request: NextRequest, fallback: URL): URL {
  const raw = request.nextUrl.searchParams.get("callbackURL");
  if (!raw) return fallback;
  if (raw.startsWith("/") && !raw.startsWith("//")) return new URL(raw, request.url);
  try {
    const target = new URL(raw);
    const allowed = [env.ADMIN_APP_URL, env.AUTH_APP_URL]
      .filter((o): o is string => Boolean(o))
      .map((o) => new URL(o).origin);
    return allowed.includes(target.origin) ? target : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Sessions created before COOKIE_DOMAIN was set have cookies scoped to this host only, so the
 * admin app never receives them. Re-issue Better Auth's cookies on the parent domain while
 * redirecting, otherwise /login and the admin app would bounce the visitor back and forth.
 */
function shareAuthCookies(request: NextRequest, response: NextResponse): NextResponse {
  if (!env.COOKIE_DOMAIN) return response;
  const persistent = !request.cookies.getAll().some((c) => c.name.endsWith("better-auth.dont_remember"));
  for (const cookie of request.cookies.getAll()) {
    if (!cookie.name.includes("better-auth.")) continue;
    response.cookies.set({
      name: cookie.name,
      value: cookie.value,
      domain: env.COOKIE_DOMAIN,
      path: "/",
      httpOnly: true,
      secure: cookie.name.startsWith("__Secure-"),
      sameSite: "lax",
      // The session's real expiry is enforced server side; this only keeps the cookie around.
      ...(persistent ? { maxAge: 60 * 60 * 24 * 7 } : {}),
    });
  }
  return response;
}

function isLocaleSegment(segment: string | undefined): segment is AppLocale {
  return (
    segment !== undefined &&
    (routing.locales as readonly string[]).includes(segment)
  );
}

/** Path after optional `[locale]` prefix, always starting with `/`. */
function getLocaleAndRestPath(pathname: string): { locale: AppLocale; restPath: string } {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return { locale: routing.defaultLocale, restPath: "/" };
  }
  const first = segments[0];
  if (isLocaleSegment(first)) {
    const rest = segments.slice(1);
    return {
      locale: first,
      restPath: rest.length === 0 ? "/" : `/${rest.join("/")}`,
    };
  }
  return {
    locale: routing.defaultLocale,
    restPath: `/${segments.join("/")}`,
  };
}

function localizedUrl(request: NextRequest, locale: AppLocale, path: string): URL {
  const tail = path === "/" ? "" : path;
  let pathname: string;
  if (routing.localePrefix === "always") {
    pathname = `/${locale}${tail}`;
  } else if (locale === routing.defaultLocale) {
    pathname = tail || "/";
  } else {
    pathname = `/${locale}${tail}`;
  }
  return new URL(pathname, request.url);
}

export async function proxy(request: NextRequest) {
  const intlResponse = handleI18n(request);

  if (intlResponse.status >= 300 && intlResponse.status < 400) {
    return intlResponse;
  }

  const { pathname } = request.nextUrl;
  const { locale, restPath } = getLocaleAndRestPath(pathname);

  if (restPath === "/") {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (session) {
      return NextResponse.redirect(localizedUrl(request, locale, "/dashboard"));
    }
    return NextResponse.redirect(localizedUrl(request, locale, "/login"));
  }

  if (restPath === "/dashboard" || restPath.startsWith("/dashboard/")) {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      const callbackPath =
        routing.localePrefix === "always"
          ? `/${locale}/dashboard`
          : "/dashboard";
      const loginWithReturn = `/login?callbackURL=${encodeURIComponent(callbackPath)}`;
      return NextResponse.redirect(localizedUrl(request, locale, loginWithReturn));
    }
  }

  // Device sign-in: the code is bound to whoever opens it, so sign in first and come back with
  // the code (verification_uri_complete carries it as ?user_code=).
  if (restPath === "/device") {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      const callbackPath = `/${locale}/device${request.nextUrl.search}`;
      const loginWithReturn = `/login?callbackURL=${encodeURIComponent(callbackPath)}`;
      return NextResponse.redirect(localizedUrl(request, locale, loginWithReturn));
    }
  }

  if (restPath === "/login" || restPath === "/signup") {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (session) {
      const destination = signedInDestination(
        request,
        localizedUrl(request, locale, "/dashboard"),
      );
      return shareAuthCookies(request, NextResponse.redirect(destination));
    }
  }

  return intlResponse;
}

export const config = {
  // Generated icons and metadata files are served as-is (no locale prefix, no sign-in).
  matcher: ["/((?!api|_next|_vercel|icon|apple-icon|manifest|opengraph-image|twitter-image|.*\\..*).*)"],
};
