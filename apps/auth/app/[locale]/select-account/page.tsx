import { Suspense } from "react";

import { AuthFormFallback } from "@/components/auth/auth-form-fallback";
import { AuthScreen } from "@/components/auth/auth-screen";
import { SelectAccountForm } from "@/components/auth/select-account-form";
import { authScreenApp } from "@/lib/app-context";

export default async function SelectAccountPage({
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
      <Suspense fallback={<AuthFormFallback height="h-64" />}>
        <SelectAccountForm />
      </Suspense>
    </AuthScreen>
  );
}
