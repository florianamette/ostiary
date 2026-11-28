import { getTranslations } from "next-intl/server";

import { adminNeedsTwoFactor } from "@ostiary/core/lib/admin/admin-two-factor";
import { currentAuthPolicy } from "@ostiary/core/lib/auth-policy";
import { env } from "@ostiary/core/lib/env";
import { enabledSocialProviders } from "@ostiary/core/lib/social-providers";
import { promptToResume } from "@ostiary/core/lib/two-factor-policy";

import { DashboardSecuritySection } from "@/components/dashboard/dashboard-security-section";
import { getDashboardContext } from "@/lib/dashboard-context";

export default async function DashboardSecurityPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  // Sent here by the two-factor prompt: turning it on resumes the app's sign-in.
  const resume = (await searchParams).continue;
  const returnUrl = promptToResume(typeof resume === "string" ? resume : null) ?? undefined;
  const t = await getTranslations({ locale, namespace: "dashboard" });
  const { session } = await getDashboardContext();
  const twoFactorRequired = adminNeedsTwoFactor(session?.user, env.REQUIRE_ADMIN_2FA === "true");
  const [socialProviders, policy] = await Promise.all([enabledSocialProviders(), currentAuthPolicy()]);

  return (
    <>
      <h1 className="sr-only">{t("nav.security")}</h1>
      <DashboardSecuritySection
        socialProviders={socialProviders}
        adminConsoleUrl={twoFactorRequired ? env.ADMIN_APP_URL : undefined}
        minPasswordLength={policy.minPasswordLength}
        signOutOnPasswordChange={policy.signOutOnPasswordChange}
        returnUrl={returnUrl}
      />
    </>
  );
}
