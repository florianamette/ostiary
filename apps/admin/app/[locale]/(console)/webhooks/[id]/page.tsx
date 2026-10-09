import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { formatDateTime, PageHeader } from "@/components/admin/common/page-header";
import { RedeliverButton } from "@/components/admin/webhooks/redeliver-button";
import { Badge } from "@ostiary/core/components/ui/badge";
import { Card, CardContent } from "@ostiary/core/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ostiary/core/components/ui/table";
import { db } from "@ostiary/core/db/index";
import { webhookDelivery, webhookEndpoint } from "@ostiary/core/db/schema";
import { DELIVERY_RETENTION_DAYS, MAX_ATTEMPTS } from "@ostiary/core/lib/webhooks/outbox";
import { requireAdminSession } from "@/lib/require-admin-session";

export const dynamic = "force-dynamic";

const SHOWN = 100;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.webhooks" });
  return { title: t("deliveries") };
}

function StatusBadge({ status, labels }: { status: string; labels: { succeeded: string; failed: string; pending: string } }) {
  if (status === "succeeded") return <Badge variant="secondary">{labels.succeeded}</Badge>;
  if (status === "failed") return <Badge variant="destructive">{labels.failed}</Badge>;
  return <Badge variant="outline">{labels.pending}</Badge>;
}

/** The delivery log of one endpoint: the latest deliveries, their answers and retries. */
export default async function AdminWebhookDeliveriesPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  await requireAdminSession();
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.webhooks" });
  const tc = await getTranslations({ locale, namespace: "admin.common" });
  const statusLabels = { succeeded: t("log.status.succeeded"), failed: t("log.status.failed"), pending: t("log.status.pending") };
  const [endpoint] = await db
    .select({ url: webhookEndpoint.url, description: webhookEndpoint.description, enabled: webhookEndpoint.enabled })
    .from(webhookEndpoint)
    .where(eq(webhookEndpoint.id, id));
  if (!endpoint) notFound();
  const rows = await db
    .select()
    .from(webhookDelivery)
    .where(eq(webhookDelivery.endpointId, id))
    .orderBy(desc(webhookDelivery.createdAt))
    .limit(SHOWN);

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/webhooks", label: t("title") }}
        title={t("deliveries")}
        description={
          <>
            <span className="break-all font-mono text-xs">{endpoint.url}</span>
            {endpoint.description ? ` · ${endpoint.description}` : null}
            {endpoint.enabled ? null : ` · ${t("log.disabled")}`}
          </>
        }
      />
      <Card className="border-border/80 shadow-sm">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">{t("log.empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">{tc("created")}</TableHead>
                  <TableHead>{t("log.event")}</TableHead>
                  <TableHead>{tc("status")}</TableHead>
                  <TableHead>{t("log.response")}</TableHead>
                  <TableHead>{t("log.attempts")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("log.nextRetry")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("log.answer")}</TableHead>
                  <TableHead className="pr-6" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap pl-6 text-sm text-muted-foreground">
                      {formatDateTime(row.createdAt, locale)}
                    </TableCell>
                    <TableCell>
                      <p className="font-mono text-xs">{row.eventType}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{row.eventId}</p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} labels={statusLabels} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.responseStatus ?? (row.attempts > 0 ? t("log.error") : "-")}</TableCell>
                    <TableCell className="text-sm">
                      {row.attempts}/{MAX_ATTEMPTS}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground md:table-cell">
                      {row.status === "pending" ? formatDateTime(row.nextAttemptAt, locale) : "-"}
                    </TableCell>
                    <TableCell className="hidden max-w-[22rem] truncate font-mono text-xs text-muted-foreground lg:table-cell" title={row.responseExcerpt ?? undefined}>
                      {row.responseExcerpt?.slice(0, 120) || "-"}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <RedeliverButton deliveryId={row.id} disabled={!endpoint.enabled} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        {t("log.footer", { shown: SHOWN, days: DELIVERY_RETENTION_DAYS, retries: MAX_ATTEMPTS - 1, header: "webhook-id" })}
      </p>
    </div>
  );
}
