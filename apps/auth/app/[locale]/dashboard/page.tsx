import { ShieldAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { currentAuthPolicy } from "@ostiary/core/lib/auth-policy";

import { DashboardAccountSummary } from "@/components/dashboard/dashboard-account-summary";
import { DashboardActivitySection } from "@/components/dashboard/dashboard-activity-section";
import { getMyActivity } from "@/lib/account-activity-actions";
import { DashboardApiKeysSection } from "@/components/dashboard/dashboard-api-keys-section";
import { DashboardAppsSection } from "@/components/dashboard/dashboard-apps-section";
import { DashboardDataSection } from "@/components/dashboard/dashboard-data-section";
import { DashboardOrganizationsSection } from "@/components/dashboard/dashboard-organizations-section";
import { DashboardProfileSection } from "@/components/dashboard/dashboard-profile-section";
import { DashboardPhoneSection } from "@/components/dashboard/dashboard-phone-section";
import { smsConfigured } from "@ostiary/core/lib/sms";
import { DashboardSecuritySection } from "@/components/dashboard/dashboard-security-section";
import { getDashboardContext } from "@/lib/dashboard-context";
import { getDeletionStatus } from "@/lib/account-data-actions";
import { getMyApiKeys } from "@/lib/api-keys-actions";
import { getMyConnectedApps } from "@/lib/connected-apps-actions";
import { Alert, AlertDescription, AlertTitle } from "@ostiary/core/components/ui/alert";
import { adminNeedsTwoFactor } from "@ostiary/core/lib/admin/admin-two-factor";
import { env } from "@ostiary/core/lib/env";
import { promptToResume } from "@ostiary/core/lib/two-factor-policy";
import { enabledSocialProviders } from "@ostiary/core/lib/social-providers";

export default async function DashboardPage({
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
  const { session, hasOrganizations, showApiKeys } = await getDashboardContext();
  // The admin console sends admins here until they turn on two-factor authentication.
  const twoFactorRequired = adminNeedsTwoFactor(session?.user, env.REQUIRE_ADMIN_2FA === "true");
  // Read here rather than by each section after it renders: the sections show at once. A read
  // that fails leaves null, and the section tries again in the browser (or says it could not).
  const orNull = <T,>(promise: Promise<T>) => promise.catch(() => null);
  const [socialProviders, connectedApps, apiKeys, deletionStatus, policy, activity] = await Promise.all([
    enabledSocialProviders(),
    orNull(getMyConnectedApps()),
    showApiKeys ? orNull(getMyApiKeys()) : null,
    orNull(getDeletionStatus()),
    currentAuthPolicy(),
    orNull(getMyActivity(null)),
  ]);

  return (
    <div className="space-y-10">
      <section id="overview" className="scroll-mt-32 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
            {t("description")}
          </p>
        </div>
        {twoFactorRequired ? (
          <Alert>
            <ShieldAlert aria-hidden />
            <AlertTitle>{t("twoFactor.adminRequiredTitle")}</AlertTitle>
            <AlertDescription>
              {t("twoFactor.adminRequiredBody")}{" "}
              <a href="#two-factor" className="font-medium text-foreground underline underline-offset-4">
                {t("twoFactor.adminRequiredLink")}
              </a>
            </AlertDescription>
          </Alert>
        ) : null}
        <DashboardAccountSummary />
      </section>
      <div className="space-y-10">
        <DashboardProfileSection />
        {smsConfigured() ? (
          <DashboardPhoneSection phoneNumber={(session?.user as { phoneNumber?: string | null } | undefined)?.phoneNumber ?? null} />
        ) : null}
        {hasOrganizations ? <DashboardOrganizationsSection /> : null}
        <DashboardSecuritySection
          socialProviders={socialProviders}
          adminConsoleUrl={twoFactorRequired ? env.ADMIN_APP_URL : undefined}
          minPasswordLength={policy.minPasswordLength}
          signOutOnPasswordChange={policy.signOutOnPasswordChange}
          returnUrl={returnUrl}
        />
        <DashboardActivitySection initialPage={activity} />
        <DashboardAppsSection initialApps={connectedApps} />
        {showApiKeys ? <DashboardApiKeysSection initialKeys={apiKeys} /> : null}
        <DashboardDataSection status={deletionStatus} />
      </div>
    </div>
  );
}
