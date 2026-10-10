import { AuthFormFallback } from "@/components/auth/auth-form-fallback";
import { AuthScreen } from "@/components/auth/auth-screen";
import { authScreenApp } from "@/lib/app-context";
import { noIndexMetadata } from "@/lib/page-metadata";
import { Suspense } from "react";

import { TwoFactorForm } from "@/components/auth/two-factor-form";

export const generateMetadata = noIndexMetadata("auth.twoFactor", "metaTitle", { follow: false });

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const app = await authScreenApp(await searchParams);

  return (
    <AuthScreen locale={locale} app={app} appIntent="continue">
      <Suspense fallback={<AuthFormFallback />}>
        <TwoFactorForm />
      </Suspense>
    </AuthScreen>
  );
}
