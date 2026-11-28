import { ShieldAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Alert, AlertDescription, AlertTitle } from "@ostiary/core/components/ui/alert";
import { adminNeedsTwoFactor } from "@ostiary/core/lib/admin/admin-two-factor";
import { env } from "@ostiary/core/lib/env";

import { DashboardChecklist } from "@/components/dashboard/dashboard-checklist";
import { DashboardLegacyAnchor } from "@/components/dashboard/dashboard-legacy-anchor";
import { Link } from "@/i18n/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import { dashboardHref } from "@/lib/dashboard-tabs";

/** The account page's overview: what needs doing, each with a link to the tab that does it. */
export default async function DashboardOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard" });
  const { session } = await getDashboardContext();
  // The admin console sends admins here until they turn on two-factor authentication.
  const twoFactorRequired = adminNeedsTwoFactor(session?.user, env.REQUIRE_ADMIN_2FA === "true");

  return (
    <div className="space-y-6">
      <DashboardLegacyAnchor />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">{t("description")}</p>
      </div>
      {twoFactorRequired ? (
        <Alert>
          <ShieldAlert aria-hidden />
          <AlertTitle>{t("twoFactor.adminRequiredTitle")}</AlertTitle>
          <AlertDescription>
            {t("twoFactor.adminRequiredBody")}{" "}
            <Link href={dashboardHref("security", "two-factor")} className="font-medium text-foreground underline underline-offset-4">
              {t("twoFactor.adminRequiredLink")}
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}
      <DashboardChecklist />
    </div>
  );
}
