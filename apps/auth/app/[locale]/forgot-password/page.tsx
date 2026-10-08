import { AuthScreen } from "@/components/auth/auth-screen";
import { captchaConfig } from "@ostiary/core/lib/captcha";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

function ForgotPasswordFallback() {
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
    namespace: "auth.forgotPassword",
  });
  return {
    title: t("metaTitle"),
    robots: { index: false, follow: true },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <AuthScreen locale={locale}>
        <Suspense fallback={<ForgotPasswordFallback />}>
          <ForgotPasswordForm captcha={captchaConfig()} />
        </Suspense>
    </AuthScreen>
  );
}
