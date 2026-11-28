import { getTranslations } from "next-intl/server";

import { smsConfigured } from "@ostiary/core/lib/sms";

import { DashboardPhoneSection } from "@/components/dashboard/dashboard-phone-section";
import { DashboardProfileSection } from "@/components/dashboard/dashboard-profile-section";
import { getDashboardContext } from "@/lib/dashboard-context";

export default async function DashboardProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard" });
  const { session } = await getDashboardContext();
  return (
    <div className="space-y-10">
      <h1 className="sr-only">{t("nav.profile")}</h1>
      <DashboardProfileSection />
      {smsConfigured() ? (
        <DashboardPhoneSection phoneNumber={(session?.user as { phoneNumber?: string | null } | undefined)?.phoneNumber ?? null} />
      ) : null}
    </div>
  );
}
