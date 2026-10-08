import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { userHasAdminRole } from "@ostiary/core/lib/admin/user-has-admin-role";
import { env } from "@ostiary/core/lib/env";
import { getDashboardContext } from "@/lib/dashboard-context";
import { redirect } from "@/i18n/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard" });
  return {
    title: t("title"),
    robots: { index: false, follow: true },
  };
}

export default async function DashboardLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  const { session, hasOrganizations, showApiKeys } = await getDashboardContext();

  const sessionUser = session?.user;
  if (!sessionUser) {
    redirect({
      href: `/login?callbackURL=${encodeURIComponent(`/${locale}/dashboard`)}`,
      locale,
    });
    return null;
  }

  const isAdmin = userHasAdminRole(sessionUser.role, ["admin"]);

  return (
    <DashboardShell
      user={{
        id: sessionUser.id,
        name: sessionUser.name ?? "",
        email: sessionUser.email,
      }}
      isAdmin={isAdmin}
      showOrganizations={hasOrganizations}
      showApiKeys={showApiKeys}
      impersonation={
        session?.session.impersonatedBy
          ? { userId: sessionUser.id, adminAppUrl: env.ADMIN_APP_URL ?? null }
          : null
      }
    >
      {children}
    </DashboardShell>
  );
}
