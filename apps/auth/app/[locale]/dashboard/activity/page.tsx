import { getTranslations } from "next-intl/server";

import { DashboardActivitySection } from "@/components/dashboard/dashboard-activity-section";
import { getMyActivity } from "@/lib/account-activity-actions";

export default async function DashboardActivityPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard" });
  // A read that fails leaves null, and the section tries again in the browser.
  const activity = await getMyActivity(null).catch(() => null);
  return (
    <>
      <h1 className="sr-only">{t("nav.activity")}</h1>
      <DashboardActivitySection initialPage={activity} />
    </>
  );
}
