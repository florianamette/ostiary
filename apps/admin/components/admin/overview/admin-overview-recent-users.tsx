"use client";

import * as React from "react";
import { useFormatter, useTranslations } from "next-intl";

import { Alert, AlertDescription, AlertTitle } from "@ostiary/core/components/ui/alert";
import { Badge } from "@ostiary/core/components/ui/badge";
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
import { authClient } from "@/lib/auth-client";

type Row = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned: boolean | null;
  createdAt?: Date | string | null;
};

function formatJoined(
  value: Date | string | undefined | null,
  format: ReturnType<typeof useFormatter>
) {
  if (value == null) return "-";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return format.dateTime(d, { year: "numeric", month: "short", day: "numeric" });
}

export function AdminOverviewRecentUsers({
  refreshKey,
}: {
  refreshKey: number;
}) {
  const t = useTranslations("admin.pages.overview.recentUsers");
  const tu = useTranslations("admin.pages.users");
  const tc = useTranslations("admin.common");
  const format = useFormatter();
  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      const res = await authClient.admin.listUsers({
        query: {
          limit: 8,
          offset: 0,
          sortBy: "createdAt",
          sortDirection: "desc",
        },
      });
      if (cancelled) return;
      if (res.error) {
        setError(res.error.message ?? tu("list.loadErrorFallback"));
        setRows([]);
        setLoading(false);
        return;
      }
      const users = (res.data?.users ?? []) as Row[];
      setRows(users);
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [refreshKey, tu]);

  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>
          {t("description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>{tu("list.loadErrorTitle")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : loading ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            {t("loading")}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            {t("empty")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{tu("list.columns.user")}</TableHead>
                <TableHead className="hidden sm:table-cell">{tu("list.columns.role")}</TableHead>
                <TableHead className="hidden md:table-cell">{tc("status")}</TableHead>
                <TableHead className="text-right">{tu("list.columns.joined")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <Link href={`/users/${u.id}`} className="font-medium underline-offset-4 hover:underline">
                        {u.name}
                      </Link>
                      <span className="text-muted-foreground text-xs">
                        {u.email}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge
                      variant={
                        u.role?.includes("admin") ? "default" : "secondary"
                      }
                      className="font-normal"
                    >
                      {u.role || "user"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {u.banned ? (
                      <Badge variant="destructive">{tu("status.banned")}</Badge>
                    ) : (
                      <Badge variant="outline" className="font-normal">
                        {tu("status.active")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right text-sm">
                    {formatJoined(u.createdAt, format)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
