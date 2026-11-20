import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/common/page-header";
import { AdminUserImport } from "@/components/admin/users/admin-user-import";
import { requireAdminSession } from "@/lib/require-admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.userImport" });
  return { title: t("title"), description: t("description") };
}

export default async function AdminUserImportPage({ params }: { params: Promise<{ locale: string }> }) {
  await requireAdminSession();
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages" });

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/users", label: t("users.title") }}
        title={t("userImport.title")}
        description={t("userImport.description")}
      />
      <AdminUserImport />
    </div>
  );
}
