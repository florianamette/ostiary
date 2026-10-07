import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminUsersPanel } from "@/components/admin/users/admin-users-panel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.users" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function AdminUsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.users" });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
          {t("description")}
        </p>
      </div>
      <AdminUsersPanel />
    </div>
  );
}
