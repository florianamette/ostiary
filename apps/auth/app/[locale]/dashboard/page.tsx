import { ShieldAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { DashboardAccountSummary } from "@/components/dashboard/dashboard-account-summary";
import { DashboardApiKeysSection } from "@/components/dashboard/dashboard-api-keys-section";
import { DashboardAppsSection } from "@/components/dashboard/dashboard-apps-section";
import { DashboardOrganizationsSection } from "@/components/dashboard/dashboard-organizations-section";
import { DashboardProfileSection } from "@/components/dashboard/dashboard-profile-section";
import { DashboardSecuritySection } from "@/components/dashboard/dashboard-security-section";
import { getDashboardContext } from "@/lib/dashboard-context";
import { Alert, AlertDescription, AlertTitle } from "@ostiary/core/components/ui/alert";
import { adminNeedsTwoFactor } from "@ostiary/core/lib/admin/admin-two-factor";
import { env } from "@ostiary/core/lib/env";
import { enabledSocialProviders } from "@ostiary/core/lib/social-providers";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard" });
  const { session, hasOrganizations, showApiKeys } = await getDashboardContext();
  // The admin console sends admins here until they turn on two-factor authentication.
  const twoFactorRequired = adminNeedsTwoFactor(session?.user, env.REQUIRE_ADMIN_2FA === "true");

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
        {hasOrganizations ? <DashboardOrganizationsSection /> : null}
        <DashboardSecuritySection
          socialProviders={enabledSocialProviders()}
          adminConsoleUrl={twoFactorRequired ? env.ADMIN_APP_URL : undefined}
        />
        <DashboardAppsSection />
        {showApiKeys ? <DashboardApiKeysSection /> : null}
      </div>
    </div>
  );
}
