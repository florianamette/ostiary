import { AuthScreen } from "@/components/auth/auth-screen";
import { captchaConfig } from "@ostiary/core/lib/captcha";
import { SignupForm } from "@/components/auth/signup-form";
import { enabledSocialProviders, googleOneTap } from "@ostiary/core/lib/social-providers";

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
        <SignupForm
          socialProviders={await enabledSocialProviders()}
          captcha={captchaConfig()}
          oneTap={await googleOneTap()}
        />
    </AuthScreen>
  );
}
