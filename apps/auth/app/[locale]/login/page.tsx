import { AuthScreen } from "@/components/auth/auth-screen";
import { captchaConfig } from "@ostiary/core/lib/captcha";
import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";
import { enabledSocialProviders, googleOneTap } from "@ostiary/core/lib/social-providers";

function LoginFallback() {
  return (
    <div className="h-80 w-full max-w-md animate-pulse rounded-xl bg-muted/60" />
  );
}

// Providers enabled from the admin console are read at request time.
export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <AuthScreen locale={locale}>
        <Suspense fallback={<LoginFallback />}>
          <LoginForm
            socialProviders={await enabledSocialProviders()}
            captcha={captchaConfig()}
            oneTap={await googleOneTap()}
          />
        </Suspense>
    </AuthScreen>
  );
}
