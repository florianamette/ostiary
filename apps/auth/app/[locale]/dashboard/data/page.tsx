import { getTranslations } from "next-intl/server";

import { DashboardDataSection } from "@/components/dashboard/dashboard-data-section";
import { getDeletionStatus } from "@/lib/account-data-actions";

export default async function DashboardDataPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard" });
  const status = await getDeletionStatus().catch(() => null);
  return (
    <>
      <h1 className="sr-only">{t("nav.data")}</h1>
      <DashboardDataSection status={status} />
    </>
  );
}
