import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { formatDateTime, PageHeader } from "@/components/admin/common/page-header";
import { FailedSignInsChart } from "@/components/admin/security/failed-sign-ins-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ostiary/core/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ostiary/core/components/ui/table";
import { Link } from "@/i18n/navigation";
import { requireAdminSession } from "@/lib/require-admin-session";
import { getSecurityStats } from "@/lib/security-stats";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.security" });
  return { title: t("title") };
}

export default async function SecurityPage({ params }: { params: Promise<{ locale: string }> }) {
  await requireAdminSession();
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.security" });
  const stats = await getSecurityStats();

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: t("tiles.failed24h"), value: stats.totals.last24h },
          { label: t("tiles.failed7d"), value: stats.totals.last7d },
          { label: t("tiles.banned"), value: stats.banned.length },
        ].map((tile) => (
          <div key={tile.label} className="rounded-lg border border-border/80 bg-card p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tile.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{tile.value.toLocaleString(locale)}</p>
          </div>
        ))}
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>{t("perDay.title")}</CardTitle>
          <CardDescription>{t("perDay.description", { total: stats.totals.last30d })}</CardDescription>
        </CardHeader>
        <CardContent>
          <FailedSignInsChart data={stats.series} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">{t("topAccounts.title")}</CardTitle>
            <CardDescription>{t("topAccounts.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.topIdentifiers.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noFailures")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("topAccounts.identifier")}</TableHead>
                    <TableHead className="text-right">{t("attempts")}</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">{t("topAccounts.last")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.topIdentifiers.map((row) => (
                    <TableRow key={row.identifier}>
                      <TableCell className="max-w-[16rem] truncate text-sm">{row.identifier}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.n}</TableCell>
                      <TableCell className="hidden text-right text-xs text-muted-foreground sm:table-cell">{formatDateTime(row.last, locale)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">{t("topIps.title")}</CardTitle>
            <CardDescription>{t("topIps.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.topIps.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noFailures")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("topIps.ip")}</TableHead>
                    <TableHead className="text-right">{t("attempts")}</TableHead>
                    <TableHead className="text-right">{t("topIps.accounts")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.topIps.map((row) => (
                    <TableRow key={row.ip}>
                      <TableCell className="font-mono text-xs">{row.ip}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.n}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.accounts}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{t("banned.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.banned.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("banned.empty")}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {stats.banned.map((b) => (
                <li key={b.id} className="flex flex-wrap justify-between gap-2">
                  <Link href={`/users/${b.id}`} className="underline-offset-4 hover:underline">{b.name || b.email}</Link>
                  <span className="text-xs text-muted-foreground">
                    {b.reason || t("banned.noReason")}
                    {b.expires ? ` · ${t("banned.until", { date: formatDateTime(b.expires, locale) })}` : ` · ${t("banned.permanent")}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
