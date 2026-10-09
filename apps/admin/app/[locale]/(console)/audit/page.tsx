import type { Metadata } from "next";
import { desc, inArray, like } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { formatDateTime, PageHeader } from "@/components/admin/common/page-header";
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
import { auditLog, organization, user } from "@ostiary/core/db/schema";
import { Link } from "@/i18n/navigation";
import { getAuditActionLabel } from "@/lib/admin-audit";
import { requireAdminSession } from "@/lib/require-admin-session";
import { cn } from "@ostiary/core/lib/utils";

export const dynamic = "force-dynamic";

const FILTERS = [
  "all",
  "user",
  "organization",
  "oauth_client",
  "oauth_consent",
  "oauth_resource",
  "api_key",
  "sso_provider",
  "signing_key",
  "webhook",
  "social_provider",
] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.audit" });
  return { title: t("title") };
}

function targetHref(type: string | null, id: string | null) {
  if (!id) return null;
  if (type === "user") return `/users/${id}`;
  if (type === "organization") return `/organizations/${id}`;
  if (type === "webhook") return `/webhooks/${id}`;
  if (type === "social_provider") return "/sign-in-providers";
  return null;
}

function formatMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const parts = Object.entries(metadata as Record<string, unknown>)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  return parts.length ? parts.join(" · ") : null;
}

export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  await requireAdminSession();
  const { locale } = await params;
  const { type = "all" } = await searchParams;
  const t = await getTranslations({ locale, namespace: "admin.pages.audit" });
  const actionLabel = await getAuditActionLabel(locale);
  const filter = FILTERS.some((f) => f === type) ? type : "all";

  const rows = await db
    .select()
    .from(auditLog)
    .where(filter === "all" ? undefined : like(auditLog.action, `${filter}.%`))
    .orderBy(desc(auditLog.createdAt))
    .limit(200);

  // Hook-recorded entries only carry ids; show current emails and organization names.
  const idsOf = (type: string) => [...new Set(rows.filter((r) => r.targetType === type && r.targetId).map((r) => r.targetId!))];
  const userIds = idsOf("user");
  const orgIds = idsOf("organization");
  const labels = new Map<string, string>();
  if (userIds.length) {
    for (const u of await db.select({ id: user.id, email: user.email }).from(user).where(inArray(user.id, userIds))) labels.set(u.id, u.email);
  }
  if (orgIds.length) {
    for (const o of await db.select({ id: organization.id, name: organization.name }).from(organization).where(inArray(organization.id, orgIds))) labels.set(o.id, o.name);
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />

      <nav className="flex flex-wrap gap-2" aria-label={t("filterLabel")}>
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/audit" : `/audit?type=${f}`}
            aria-current={filter === f ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              filter === f
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`filters.${f}`)}
          </Link>
        ))}
      </nav>

      <Card className="border-border/80 shadow-sm">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">{t("columns.when")}</TableHead>
                  <TableHead>{t("columns.who")}</TableHead>
                  <TableHead>{t("columns.action")}</TableHead>
                  <TableHead>{t("columns.target")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("columns.details")}</TableHead>
                  <TableHead className="hidden pr-6 md:table-cell">{t("columns.ip")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const href = targetHref(row.targetType, row.targetId);
                  const label = (row.targetId && labels.get(row.targetId)) ?? row.targetLabel ?? row.targetId ?? "-";
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap pl-6 text-sm text-muted-foreground">
                        {formatDateTime(row.createdAt, locale)}
                      </TableCell>
                      <TableCell className="max-w-[14rem] truncate text-sm">
                        {row.actorEmail ?? t("system")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal">
                          {actionLabel(row.action)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[16rem] truncate text-sm">
                        {href ? (
                          <Link href={href} className="underline-offset-4 hover:underline">
                            {label}
                          </Link>
                        ) : (
                          <span className="font-mono text-xs">{label}</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden max-w-[22rem] truncate text-xs text-muted-foreground lg:table-cell">
                        {formatMetadata(row.metadata) ?? "-"}
                      </TableCell>
                      <TableCell className="hidden pr-6 font-mono text-xs text-muted-foreground md:table-cell">
                        {row.ipAddress ?? "-"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">{t("footnote")}</p>
    </div>
  );
}
