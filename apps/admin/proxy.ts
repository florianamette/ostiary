import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";

import { userHasAdminRole } from "@ostiary/core/lib/admin/user-has-admin-role";
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

/**
 * Sends signed-out visitors to sign in on the auth app, then back to the page they asked for,
 * and signed-in non-admins to their account dashboard. The (console) layout repeats the role
 * check as a second gate.
 */
export async function proxy(request: NextRequest) {
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

  return intlResponse;
}

export const config = {
  // Generated icons and metadata files are served as-is (no locale prefix, no sign-in).
  matcher: ["/((?!api|_next|_vercel|icon|apple-icon|manifest|opengraph-image|twitter-image|.*\\..*).*)"],
};
