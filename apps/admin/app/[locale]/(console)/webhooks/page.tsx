import { asc, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { formatDateTime, PageHeader } from "@/components/admin/common/page-header";
import { AdminWebhooksPanel } from "@/components/admin/webhooks/admin-webhooks-panel";
import { db } from "@ostiary/core/db/index";
import { webhookDelivery, webhookEndpoint } from "@ostiary/core/db/schema";
import { brand } from "@ostiary/core/lib/brand";
import { WEBHOOK_EVENT_TYPES } from "@ostiary/core/lib/webhooks/events";
import { AUTO_DISABLE_AFTER, webhooksAllowLocalhost } from "@ostiary/core/lib/webhooks/outbox";
import { requireAdminSession } from "@/lib/require-admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.webhooks" });
  return { title: t("title"), description: t("description", { name: brand.name }) };
}

export default async function AdminWebhooksPage({ params }: { params: Promise<{ locale: string }> }) {
  await requireAdminSession();
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.webhooks" });
  const [endpoints, stats] = await Promise.all([
    db.select().from(webhookEndpoint).orderBy(asc(webhookEndpoint.createdAt)),
    db
      .select({
        endpointId: webhookDelivery.endpointId,
        pending: sql<number>`count(*) filter (where ${webhookDelivery.status} = 'pending')`.mapWith(Number),
        failed: sql<number>`count(*) filter (where ${webhookDelivery.status} = 'failed')`.mapWith(Number),
      })
      .from(webhookDelivery)
      .groupBy(webhookDelivery.endpointId),
  ]);
  const statsOf = new Map(stats.map((row) => [row.endpointId, row]));
  const now = new Date();

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description", { name: brand.name })} />
      <AdminWebhooksPanel
        // Message keys can't contain dots: user.created -> eventDescriptions.user_created.
        eventTypes={WEBHOOK_EVENT_TYPES.map((type) => ({ type, description: t(`eventDescriptions.${type.replaceAll(".", "_")}`) }))}
        allowLocalhost={webhooksAllowLocalhost()}
        autoDisableAfter={AUTO_DISABLE_AFTER}
        endpoints={endpoints.map((row) => ({
          id: row.id,
          url: row.url,
          description: row.description,
          events: row.events,
          enabled: row.enabled,
          disabledReason: row.disabledReason,
          disabledAt: row.disabledAt ? formatDateTime(row.disabledAt, locale) : null,
          consecutiveFailures: row.consecutiveFailures,
          lastSuccessAt: row.lastSuccessAt ? formatDateTime(row.lastSuccessAt, locale) : null,
          lastFailureAt: row.lastFailureAt ? formatDateTime(row.lastFailureAt, locale) : null,
          rotating: Boolean(row.previousSecretExpiresAt && row.previousSecretExpiresAt > now),
          pending: statsOf.get(row.id)?.pending ?? 0,
          failed: statsOf.get(row.id)?.failed ?? 0,
        }))}
      />
    </div>
  );
}
