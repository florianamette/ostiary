import { AuthFormFallback } from "@/components/auth/auth-form-fallback";
import { AuthScreen } from "@/components/auth/auth-screen";
import { authScreenApp } from "@/lib/app-context";
import { appLinkOf } from "@/lib/app-links";
import { noIndexMetadata } from "@/lib/page-metadata";
import { Suspense } from "react";

import { currentAuthPolicy } from "@ostiary/core/lib/auth-policy";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const generateMetadata = noIndexMetadata("auth.resetPassword", "metaTitle", { follow: true });

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const [app, policy] = await Promise.all([authScreenApp(await searchParams), currentAuthPolicy()]);

  return (
    <AuthScreen locale={locale} app={app} appIntent="continue">
      <Suspense fallback={<AuthFormFallback />}>
        <ResetPasswordForm appLink={appLinkOf(app)} minPasswordLength={policy.minPasswordLength} />
      </Suspense>
    </AuthScreen>
  );
}
