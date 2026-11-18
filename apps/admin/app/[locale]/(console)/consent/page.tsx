import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/common/page-header";
import {
  readChoice,
  readPagination,
  readParam,
  type ListSearchParams,
} from "@/components/admin/common/list-params";
import { AdminConsentPanel } from "@/components/admin/consent/admin-consent-panel";
import { CONSENT_SCOPE_FILTERS, listConsents } from "@/lib/consent-list";
import { requireAdminSession } from "@/lib/require-admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.consent" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function AdminConsentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<ListSearchParams>;
}) {
  await requireAdminSession();
  const { locale } = await params;
  const query = await searchParams;
  const t = await getTranslations({ locale, namespace: "admin.pages.consent" });
  const { pageSize, offset } = readPagination(query);
  const search = readParam(query, "q");
  const scope = readChoice(query, "scope", CONSENT_SCOPE_FILTERS, "all");

  const { rows, total } = await listConsents({ search, scope, limit: pageSize, offset });

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <AdminConsentPanel
        filtered={search !== "" || scope !== "all"}
        total={total}
        consents={rows.map((row) => ({
          id: row.id,
          userId: row.userId,
          userLabel: row.userEmail ?? row.userName ?? row.userId ?? "-",
          clientId: row.clientId,
          clientLabel: row.clientName ?? row.clientId,
          clientIcon: row.clientIcon,
          referenceId: row.referenceId ?? undefined,
          scopes: row.scopes,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
