import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";

import { adminAccess } from "@ostiary/core/lib/admin/admin-access";
import { env } from "@ostiary/core/lib/env";
import { withCsp } from "@ostiary/core/lib/with-csp";
import { localizedUrl, splitLocalePath } from "@ostiary/core/i18n/locale-path";
import { routing } from "@ostiary/core/i18n/routing";
import { auth } from "@/lib/auth";

const handleI18n = createMiddleware(routing);
// lib/auth.ts refuses to start without both URLs.
const authAppUrl = env.AUTH_APP_URL!;

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
  const { locale } = splitLocalePath(pathname);
  const session = await auth.api.getSession({ headers: request.headers });
  switch (adminAccess(session?.user)) {
    case "signed_out": {
      const back = `${env.ADMIN_APP_URL}${pathname}${search}`;
      return NextResponse.redirect(localizedUrl(authAppUrl, locale, `/login?callbackURL=${encodeURIComponent(back)}`));
    }
    case "not_admin":
      return NextResponse.redirect(localizedUrl(authAppUrl, locale, "/dashboard"));
    case "needs_2fa":
      return NextResponse.redirect(localizedUrl(authAppUrl, locale, "/dashboard#two-factor"));
    case "ok":
      return intlResponse;
  }
}

/** A fresh nonce and the CSP that carries it on every page (packages/core/src/lib/with-csp.ts). */
export const proxy = withCsp(route);

export const config = {
  // Generated icons and metadata files are served as-is (no locale prefix, no sign-in).
  matcher: ["/((?!api|_next|_vercel|icon|apple-icon|manifest|opengraph-image|twitter-image|.*\\..*).*)"],
};
