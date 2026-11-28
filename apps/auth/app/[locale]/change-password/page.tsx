import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { currentAuthPolicy } from "@ostiary/core/lib/auth-policy";
import { passwordChangeRequired } from "@ostiary/core/lib/security/password-breach";

import { AuthScreen } from "@/components/auth/auth-screen";
import { BreachedPasswordForm } from "@/components/auth/breached-password-form";
import { auth } from "@/lib/auth";
import { noIndexMetadata } from "@/lib/page-metadata";

export const generateMetadata = noIndexMetadata("breachedPassword", "title", { follow: false });

/**
 * "Change your password": the password just used to sign in is in a breach
 * (security/password-breach.ts), or an admin asked for a new one. App sign-ins come here from the post-login page with their
 * signed request in the query, and resume once the password is changed; the account page sends
 * people here without one.
 */
export default async function ChangePasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/${locale}/login`);
  const resumesApp = typeof query.sig === "string";
  const reason = await passwordChangeRequired(session.user.id);
  const pending = reason !== null;
  if (!pending && !resumesApp) redirect(`/${locale}/dashboard`);
  const policy = await currentAuthPolicy();

  return (
    <AuthScreen locale={locale} app={null} appIntent="continue">
      <BreachedPasswordForm pending={pending} reason={reason} resumesApp={resumesApp} minPasswordLength={policy.minPasswordLength} />
    </AuthScreen>
  );
}
