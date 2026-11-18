import { useFormatter, useTranslations } from "next-intl";

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
import { isPlatformAdmin } from "@ostiary/core/lib/admin/user-has-admin-role";
import { formatShortDate } from "@/components/admin/common/page-header";

type Row = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  banned: boolean | null;
  createdAt: Date;
};

/** The newest accounts. Without `rows`, a loading line while they load. */
export function AdminOverviewRecentUsers({ rows }: { rows?: Row[] }) {
  const t = useTranslations("admin.pages.overview.recentUsers");
  const tu = useTranslations("admin.pages.users");
  const tc = useTranslations("admin.common");
  const format = useFormatter();

  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>
          {t("description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {!rows ? (
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
                        isPlatformAdmin(u.role) ? "default" : "secondary"
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
                    {formatShortDate(u.createdAt, format)}
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
