import { SIGN_IN_LINK_TOKEN, signInLinkCallback, signInLinkEmail } from "@ostiary/core/lib/sign-in-link";
import type { AppLocale } from "@ostiary/core/i18n/routing";

import { AuthScreen } from "@/components/auth/auth-screen";
import { SignInLinkConfirm } from "@/components/auth/sign-in-link-confirm";
import { noIndexMetadata } from "@/lib/page-metadata";

export const generateMetadata = noIndexMetadata("signInLink", "title", { follow: false });

/**
 * Where the sign-in code email's button leads (sign-in-link.ts). Opening it signs nothing in:
 * the person presses "Sign in", which goes to Better Auth's /magic-link/verify with the token.
 */
export default async function SignInLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[]; callbackURL?: string | string[] }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const token = typeof query.token === "string" && SIGN_IN_LINK_TOKEN.test(query.token) ? query.token : null;
  const email = token ? await signInLinkEmail(token) : null;
  const callbackURL = signInLinkCallback(typeof query.callbackURL === "string" ? query.callbackURL : null, locale as AppLocale);

  let verifyURL: string | null = null;
  if (token && email) {
    const params = new URLSearchParams({ token, callbackURL, errorCallbackURL: `/${locale}/sign-in-link` });
    verifyURL = `/api/auth/magic-link/verify?${params.toString()}`;
  }

  return (
    <AuthScreen locale={locale}>
      <SignInLinkConfirm email={email} verifyURL={verifyURL} />
    </AuthScreen>
  );
}
