import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";

import { env } from "@ostiary/core/lib/env";
import { resolveSafeRedirect } from "@ostiary/core/lib/safe-redirect";
import { withCsp } from "@ostiary/core/lib/with-csp";
import { localizedUrl, splitLocalePath } from "@ostiary/core/i18n/locale-path";
import { routing, type AppLocale } from "@ostiary/core/i18n/routing";
import { auth } from "@/lib/auth";

const handleI18n = createMiddleware(routing);

/**
 * Where a signed-in visitor of /login or /signup should go: the requested callbackURL when it
 * is a path on this app or a page of the admin app, otherwise the dashboard.
 */
function signedInDestination(request: NextRequest, fallback: URL): URL {
  return (
    resolveSafeRedirect(request.nextUrl.searchParams.get("callbackURL"), {
      origin: request.nextUrl.origin,
      allowedOrigins: [env.ADMIN_APP_URL, env.AUTH_APP_URL],
    }) ?? fallback
  );
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

/** To the login page, back to `callbackPath` once signed in. */
function loginRedirect(request: NextRequest, locale: AppLocale, callbackPath: string): NextResponse {
  const loginWithReturn = `/login?callbackURL=${encodeURIComponent(callbackPath)}`;
  return NextResponse.redirect(localizedUrl(request.url, locale, loginWithReturn));
}

/**
 * Every page gets a fresh nonce and the CSP that carries it (packages/core/src/lib/with-csp.ts).
 * Google One Tap's sources are added on the sign-in and sign-up pages only.
 */
export const proxy = withCsp(route, (request) => {
  const { restPath } = splitLocalePath(request.nextUrl.pathname);
  return {
    captchaProvider: env.CAPTCHA_PROVIDER,
    googleOneTap: restPath === "/login" || restPath === "/signup",
  };
});

async function route(request: NextRequest): Promise<NextResponse> {
  const intlResponse = handleI18n(request);

  if (intlResponse.status >= 300 && intlResponse.status < 400) {
    return intlResponse;
  }

  const { locale, restPath } = splitLocalePath(request.nextUrl.pathname);
  const getSession = () => auth.api.getSession({ headers: request.headers });

  if (restPath === "/") {
    const session = await getSession();
    return NextResponse.redirect(localizedUrl(request.url, locale, session ? "/dashboard" : "/login"));
  }

  if ((restPath === "/dashboard" || restPath.startsWith("/dashboard/")) && !(await getSession())) {
    const callbackPath = routing.localePrefix === "always" ? `/${locale}/dashboard` : "/dashboard";
    return loginRedirect(request, locale, callbackPath);
  }

  // Device sign-in: the code is bound to whoever opens it, so sign in first and come back with
  // the code (verification_uri_complete carries it as ?user_code=).
  if (restPath === "/device" && !(await getSession())) {
    return loginRedirect(request, locale, `/${locale}/device${request.nextUrl.search}`);
  }

  // `addAccount=1` signs in one more account (account menu, select-account page): no redirect.
  const addingAccount = restPath === "/login" && request.nextUrl.searchParams.get("addAccount") === "1";
  if ((restPath === "/login" || restPath === "/signup") && !addingAccount && (await getSession())) {
    const destination = signedInDestination(request, localizedUrl(request.url, locale, "/dashboard"));
    return shareAuthCookies(request, NextResponse.redirect(destination));
  }

  return intlResponse;
}

export const config = {
  // Generated icons and metadata files are served as-is (no locale prefix, no sign-in).
  matcher: ["/((?!api|_next|_vercel|icon|apple-icon|manifest|opengraph-image|twitter-image|.*\\..*).*)"],
};
