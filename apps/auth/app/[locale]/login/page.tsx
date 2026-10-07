import { AuthScreen } from "@/components/auth/auth-screen";
import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";
import { enabledSocialProviders } from "@ostiary/core/lib/social-providers";

function LoginFallback() {
  return (
    <div className="h-80 w-full max-w-md animate-pulse rounded-xl bg-muted/60" />
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <AuthScreen locale={locale}>
        <Suspense fallback={<LoginFallback />}>
          <LoginForm socialProviders={enabledSocialProviders()} />
        </Suspense>
    </AuthScreen>
  );
}
