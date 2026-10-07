import { formatDateTime } from "@/components/admin/common/page-header";
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
import type { OAuthClientUsage } from "@/lib/oauth-usage";

/** Which clients are used, and which haven't issued a token in 30 days. */
export function OAuthUsageCard({ usage, locale }: { usage: OAuthClientUsage[]; locale: string }) {
  const unused = usage.filter((u) => u.tokens30d === 0).length;
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Usage, last 30 days</CardTitle>
        <CardDescription>
          Access tokens issued per client.{" "}
          {unused > 0
            ? `${unused} ${unused === 1 ? "client has" : "clients have"} not issued a token in 30 days: consider disabling or deleting them.`
            : "Every client issued tokens in the last 30 days."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {usage.length === 0 ? (
          <p className="text-sm text-muted-foreground">No OAuth clients registered.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Users</TableHead>
                <TableHead className="hidden text-right md:table-cell">Consents</TableHead>
                <TableHead className="text-right">Last token</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usage.map((u) => (
                <TableRow key={u.clientId}>
                  <TableCell>
                    <span className="block text-sm font-medium">{u.name || u.clientId}</span>
                    <span className="font-mono text-xs text-muted-foreground">{u.clientId}</span>
                    {u.disabled ? <Badge variant="outline" className="ml-2">Disabled</Badge> : null}
                    {!u.disabled && u.tokens30d === 0 ? <Badge variant="outline" className="ml-2">Unused</Badge> : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{u.tokens30d.toLocaleString(locale)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{u.users30d.toLocaleString(locale)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{u.consents.toLocaleString(locale)}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{u.lastTokenAt ? formatDateTime(u.lastTokenAt, locale) : "Never"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
