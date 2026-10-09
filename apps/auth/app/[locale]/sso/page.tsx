import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Alert, AlertDescription } from "@ostiary/core/components/ui/alert";
import { AuthScreen } from "@/components/auth/auth-screen";
import { SsoSignInForm } from "@/components/auth/sso-sign-in-form";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "sso" });
  return {
    title: t("signInTitle"),
    robots: { index: false, follow: true },
  };
}

export default async function SsoSignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { locale } = await params;
  // Set when the identity provider's answer was refused (the SSO sign-in's errorCallbackURL).
  const { error } = await searchParams;
  const failed = typeof error === "string" && error.length > 0;
  const t = await getTranslations({ locale, namespace: "sso" });
  const tAuth = await getTranslations({ locale, namespace: "auth.forgotPassword" });

  return (
    <AuthScreen locale={locale}>
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t("signInTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("signInDescription")}</p>
        </div>
        {failed ? (
          <Alert variant="destructive">
            <AlertDescription>
              {t("signInFailed")} <span className="font-mono text-xs">({error.slice(0, 60)})</span>
            </AlertDescription>
          </Alert>
        ) : null}
        <SsoSignInForm />
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="underline-offset-4 hover:underline">
            {tAuth("backToLogin")}
          </Link>
        </p>
      </div>
    </AuthScreen>
  );
}
