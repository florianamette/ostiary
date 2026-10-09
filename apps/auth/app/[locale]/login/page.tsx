import { AuthScreen } from "@/components/auth/auth-screen";
import { captchaConfig } from "@ostiary/core/lib/captcha";
import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";
import { authScreenApp } from "@/lib/app-context";
import { appShowsProvider, appSocialProviders } from "@/lib/app-links";
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
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const [app, providers] = await Promise.all([authScreenApp(await searchParams), enabledSocialProviders()]);
  // An app whose branding hides Google also gets no One Tap prompt.
  const oneTap = appShowsProvider(app, "google") ? await googleOneTap() : null;

  return (
    <AuthScreen locale={locale} app={app} appIntent="signIn">
        <Suspense fallback={<LoginFallback />}>
          <LoginForm
            socialProviders={appSocialProviders(providers, app)}
            captcha={captchaConfig()}
            oneTap={oneTap}
            appLink={app ? { token: app.token, resumePath: app.resumePath } : null}
          />
        </Suspense>
    </AuthScreen>
  );
}
