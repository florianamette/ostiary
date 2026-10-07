import { AuthScreen } from "@/components/auth/auth-screen";
import { SignupForm } from "@/components/auth/signup-form";
import { enabledSocialProviders } from "@ostiary/core/lib/social-providers";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <AuthScreen locale={locale}>
        <SignupForm socialProviders={enabledSocialProviders()} />
    </AuthScreen>
  );
}
