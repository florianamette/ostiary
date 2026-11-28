import { getTranslations } from "next-intl/server";

import { DashboardAppsSection } from "@/components/dashboard/dashboard-apps-section";
import { getMyConnectedApps } from "@/lib/connected-apps-actions";

export default async function DashboardAppsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard" });
  const apps = await getMyConnectedApps().catch(() => null);
  return (
    <>
      <h1 className="sr-only">{t("nav.apps")}</h1>
      <DashboardAppsSection initialApps={apps} />
    </>
  );
}
