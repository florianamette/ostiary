import { asc, count, eq } from "drizzle-orm";

import { AdminOrganizationsPanel } from "@/components/admin/organizations/admin-organizations-panel";
import { requireAdminSession } from "@/lib/require-admin-session";
import { db } from "@ostiary/core/db/index";
import { member, organization } from "@ostiary/core/db/schema";

export const dynamic = "force-dynamic";

export default async function AdminOrganizationsPage() {
  await requireAdminSession();

  // Every organization on the platform, not only the ones this admin belongs to.
  const rows = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      members: count(member.id),
    })
    .from(organization)
    .leftJoin(member, eq(member.organizationId, organization.id))
    .groupBy(organization.id)
    .orderBy(asc(organization.name));

  return <AdminOrganizationsPanel organizations={rows} />;
}
