import { AuthScreen } from "@/components/auth/auth-screen";
import { SecureAccountConfirm } from "@/components/auth/secure-account-confirm";
import { SECURE_ACCOUNT_TOKEN, secureAccountTokenValid } from "@ostiary/core/lib/security/new-device";
import { noIndexMetadata } from "@/lib/page-metadata";

export const generateMetadata = noIndexMetadata("secureAccount", "title", { follow: false });

/**
 * Where the new-device email's "This wasn't me" button leads. Opening it changes nothing (mail
 * scanners follow links): the person confirms with a button. No sign-in needed.
 */
export default async function SecureAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { locale } = await params;
  const raw = (await searchParams).token;
  const token = typeof raw === "string" && SECURE_ACCOUNT_TOKEN.test(raw) ? raw : null;
  const valid = token ? await secureAccountTokenValid(token) : false;

  return (
    <AuthScreen locale={locale}>
      <SecureAccountConfirm token={valid ? token : null} />
    </AuthScreen>
  );
}
