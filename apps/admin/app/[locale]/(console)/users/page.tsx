import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/common/page-header";
import { readPagination, type ListSearchParams } from "@/components/admin/common/list-params";
import { AdminUsersPanel } from "@/components/admin/users/admin-users-panel";
import { requireAdminSession } from "@/lib/require-admin-session";
import { exportHref } from "@/lib/admin-csv-export";
import { listUsers, readUserListFilters } from "@/lib/user-list";

export const dynamic = "force-dynamic";

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
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<ListSearchParams>;
}) {
  const session = await requireAdminSession();
  const { locale } = await params;
  const query = await searchParams;
  const t = await getTranslations({ locale, namespace: "admin.pages.users" });
  const { pageSize, offset } = readPagination(query);

  const filters = readUserListFilters(query);
  const { rows, total } = await listUsers({ ...filters, limit: pageSize, offset });

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <AdminUsersPanel
        users={rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))}
        total={total}
        currentUserId={session.user.id}
        exportHref={exportHref("/api/admin/users/export", { q: filters.search, role: filters.role })}
      />
    </div>
  );
}
