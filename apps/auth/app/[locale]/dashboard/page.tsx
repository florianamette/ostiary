import { getTranslations } from "next-intl/server";

import { DashboardAccountSummary } from "@/components/dashboard/dashboard-account-summary";
import { DashboardAppsSection } from "@/components/dashboard/dashboard-apps-section";
import { DashboardOrganizationsSection } from "@/components/dashboard/dashboard-organizations-section";
import { DashboardProfileSection } from "@/components/dashboard/dashboard-profile-section";
import { DashboardSecuritySection } from "@/components/dashboard/dashboard-security-section";
import { getDashboardContext } from "@/lib/dashboard-context";
import { enabledSocialProviders } from "@ostiary/core/lib/social-providers";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard" });
  const { hasOrganizations } = await getDashboardContext();

  return (
    <div className="space-y-10">
      <section id="overview" className="scroll-mt-32 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <DashboardAccountSummary />
      </section>
      <div className="space-y-10">
        <DashboardProfileSection />
        {hasOrganizations ? <DashboardOrganizationsSection /> : null}
        <DashboardSecuritySection socialProviders={enabledSocialProviders()} />
        <DashboardAppsSection />
      </div>
    </div>
  );
}
