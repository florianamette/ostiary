import { AuthScreen } from "@/components/auth/auth-screen";
import { authScreenApp } from "@/lib/app-context";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";

function ResetPasswordFallback() {
  return (
    <div className="h-80 w-full max-w-md animate-pulse rounded-xl bg-muted/60" />
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "auth.resetPassword",
  });
  return {
    title: t("metaTitle"),
    robots: { index: false, follow: true },
  };
}

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
        <Suspense fallback={<ResetPasswordFallback />}>
          <ResetPasswordForm appLink={app ? { token: app.token, resumePath: app.resumePath } : null} />
        </Suspense>
    </AuthScreen>
  );
}
