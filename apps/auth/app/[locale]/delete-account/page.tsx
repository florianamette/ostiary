import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import { AuthScreen } from "@/components/auth/auth-screen";
import { DeleteAccountConfirm } from "@/components/auth/delete-account-confirm";
import { redirect } from "@/i18n/navigation";
import { auth } from "@/lib/auth";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "deleteAccount" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * Where the account deletion email leads. Opening it deletes nothing: the signed-in person
 * confirms with a button, which sends the token to /delete-user. Better Auth deletes only the
 * account the link was sent to, and only from a session of that account.
 */
export default async function DeleteAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { locale } = await params;
  const raw = (await searchParams).token;
  const token = typeof raw === "string" && /^[a-z0-9]{8,128}$/i.test(raw) ? raw : null;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session && token) {
    const back = `/${locale}/delete-account?token=${encodeURIComponent(token)}`;
    redirect({ href: `/login?callbackURL=${encodeURIComponent(back)}`, locale });
  }

  return (
    <AuthScreen locale={locale}>
      <DeleteAccountConfirm token={token} email={session?.user.email ?? null} />
    </AuthScreen>
  );
}
