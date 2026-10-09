import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";

import { adminNeedsTwoFactor } from "@ostiary/core/lib/admin/admin-two-factor";
import { userHasAdminRole } from "@ostiary/core/lib/admin/user-has-admin-role";
import { contentSecurityPolicy, createCspNonce, NONCE_HEADER } from "@ostiary/core/lib/csp";
import { env } from "@ostiary/core/lib/env";
import { routing, type AppLocale } from "@ostiary/core/i18n/routing";
import { auth } from "@/lib/auth";

const handleI18n = createMiddleware(routing);

function localeFrom(pathname: string): AppLocale {
  const first = pathname.split("/").filter(Boolean)[0];
  return (routing.locales as readonly string[]).includes(first ?? "")
    ? (first as AppLocale)
    : routing.defaultLocale;
}

export async function proxy(request: NextRequest) {
  // A fresh nonce and the CSP that carries it (packages/core/src/lib/csp.ts), on the response
  // and on the request, where Next.js reads it to put the nonce on its scripts.
  const nonce = createCspNonce();
  const csp = contentSecurityPolicy({ nonce, dev: process.env.NODE_ENV === "development" });
  // next-intl forwards a copy of these request headers to the page.
  request.headers.set(NONCE_HEADER, nonce);
  request.headers.set("content-security-policy", csp);
  const response = await route(request);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

/**
 * Sends signed-out visitors to sign in on the auth app, then back to the page they asked for,
 * signed-in non-admins to their account dashboard, and admins without two-factor
 * authentication (when REQUIRE_ADMIN_2FA is on) to its setup there. The (console) layout
 * repeats these checks as a second gate.
 */
async function route(request: NextRequest): Promise<NextResponse> {
  const intlResponse = handleI18n(request);
  if (intlResponse.status >= 300 && intlResponse.status < 400) {
    return intlResponse;
  }

  const { pathname, search } = request.nextUrl;
  const locale = localeFrom(pathname);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    const back = `${env.ADMIN_APP_URL}${pathname}${search}`;
    return NextResponse.redirect(
      `${env.AUTH_APP_URL}/${locale}/login?callbackURL=${encodeURIComponent(back)}`,
    );
  }
  if (!userHasAdminRole(session.user.role, ["admin"])) {
    return NextResponse.redirect(`${env.AUTH_APP_URL}/${locale}/dashboard`);
  }
  if (adminNeedsTwoFactor(session.user, env.REQUIRE_ADMIN_2FA === "true")) {
    return NextResponse.redirect(`${env.AUTH_APP_URL}/${locale}/dashboard#two-factor`);
  }

  return intlResponse;
}

export const config = {
  // Generated icons and metadata files are served as-is (no locale prefix, no sign-in).
  matcher: ["/((?!api|_next|_vercel|icon|apple-icon|manifest|opengraph-image|twitter-image|.*\\..*).*)"],
};
