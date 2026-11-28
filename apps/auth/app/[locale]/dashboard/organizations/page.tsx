import { getTranslations } from "next-intl/server";

import { DashboardOrganizationsSection } from "@/components/dashboard/dashboard-organizations-section";
import { redirect } from "@/i18n/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";

export default async function DashboardOrganizationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { hasOrganizations } = await getDashboardContext();
  // Only the default Public workspace: the tab is hidden.
  if (!hasOrganizations) return redirect({ href: "/dashboard", locale });
  const t = await getTranslations({ locale, namespace: "dashboard" });
  return (
    <>
      <h1 className="sr-only">{t("nav.organizations")}</h1>
      <DashboardOrganizationsSection />
    </>
  );
}
