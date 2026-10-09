import { formatDateTime } from "@/components/admin/common/page-header";
import { Link } from "@/i18n/navigation";
import { adminAppIconUrl } from "@/lib/app-icon-url";
import type { OAuthClientUsage } from "@/lib/oauth-usage";
import { AppIcon } from "@ostiary/core/components/app-icon";
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

/** Active applications that issued no token in 30 days: candidates for disabling. */
export function countUnusedClients(usage: OAuthClientUsage[]): number {
  return usage.filter((u) => !u.disabled && u.tokens30d === 0).length;
}

/** Which clients are used, and which haven't issued a token in 30 days. */
export function OAuthUsageCard({ usage, locale }: { usage: OAuthClientUsage[]; locale: string }) {
  const unused = countUnusedClients(usage);
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Access tokens per application, last 30 days</CardTitle>
        <CardDescription>
          {unused > 0
            ? `${unused} active ${unused === 1 ? "application has" : "applications have"} not issued a token in 30 days: consider disabling or deleting ${unused === 1 ? "it" : "them"}.`
            : "Every active application issued tokens in the last 30 days."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {usage.length === 0 ? (
          <p className="text-sm text-muted-foreground">No OAuth clients registered.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Application</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Users</TableHead>
                <TableHead className="hidden text-right md:table-cell">Consents</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Last token</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usage.map((u) => {
                const name = u.name || u.clientId;
                return (
                  <TableRow key={u.clientId}>
                    <TableCell className="max-w-0 w-full sm:max-w-none">
                      <div className="flex items-center gap-3">
                        <AppIcon name={name} src={adminAppIconUrl(u.clientId)} size={32} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Link
                              href={`/applications?q=${encodeURIComponent(u.clientId)}`}
                              className="truncate text-sm font-medium underline-offset-4 hover:underline"
                              title="Show in Applications"
                            >
                              {name}
                            </Link>
                            {u.disabled ? <Badge variant="outline">Disabled</Badge> : null}
                            {!u.disabled && u.tokens30d === 0 ? (
                              <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
                                Unused
                              </Badge>
                            ) : null}
                          </div>
                          <span className="block truncate font-mono text-xs text-muted-foreground">{u.clientId}</span>
                          <span className="block text-xs text-muted-foreground sm:hidden">
                            Last token: {u.lastTokenAt ? formatDateTime(u.lastTokenAt, locale) : "Never"}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{u.tokens30d.toLocaleString(locale)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{u.users30d.toLocaleString(locale)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{u.consents.toLocaleString(locale)}</TableCell>
                    <TableCell className="hidden text-right text-xs text-muted-foreground sm:table-cell">
                      {u.lastTokenAt ? formatDateTime(u.lastTokenAt, locale) : "Never"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
