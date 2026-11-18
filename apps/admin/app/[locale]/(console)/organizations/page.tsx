import { asc, count, ilike, inArray, or } from "drizzle-orm";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/common/page-header";
import {
  containsPattern,
  readPagination,
  readParam,
  type ListSearchParams,
} from "@/components/admin/common/list-params";
import { AdminOrganizationsPanel } from "@/components/admin/organizations/admin-organizations-panel";
import { requireAdminSession } from "@/lib/require-admin-session";
import { db } from "@ostiary/core/db/index";
import { member, organization } from "@ostiary/core/db/schema";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.organizations" });
  return { title: t("title"), description: t("description") };
}

export default async function AdminOrganizationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<ListSearchParams>;
}) {
  await requireAdminSession();
  const { locale } = await params;
  const query = await searchParams;
  const t = await getTranslations({ locale, namespace: "admin.pages.organizations" });
  const { pageSize, offset } = readPagination(query);
  const search = readParam(query, "q");
  const where = search
    ? or(ilike(organization.name, containsPattern(search)), ilike(organization.slug, containsPattern(search)))
    : undefined;

  // Every organization on the platform, not only the ones this admin belongs to, one page at a
  // time; members are counted for that page only.
  const [orgs, [{ total }]] = await Promise.all([
    db
      .select({ id: organization.id, name: organization.name, slug: organization.slug })
      .from(organization)
      .where(where)
      .orderBy(asc(organization.name), asc(organization.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(organization).where(where),
  ]);
  const counts = orgs.length
    ? await db
        .select({ organizationId: member.organizationId, members: count() })
        .from(member)
        .where(inArray(member.organizationId, orgs.map((o) => o.id)))
        .groupBy(member.organizationId)
    : [];
  const membersOf = new Map(counts.map((c) => [c.organizationId, c.members]));

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <AdminOrganizationsPanel
        organizations={orgs.map((o) => ({ ...o, members: membersOf.get(o.id) ?? 0 }))}
        total={total}
        searching={search !== ""}
      />
    </div>
  );
}
