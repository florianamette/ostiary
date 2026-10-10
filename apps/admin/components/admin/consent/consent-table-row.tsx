"use client";

import { useFormatter } from "next-intl";

import {
  AdminConsentRowActions,
  type OAuthConsentRow,
} from "@/components/admin/consent/admin-consent-row-actions";
import { AppIcon } from "@ostiary/core/components/app-icon";
import { Badge } from "@ostiary/core/components/ui/badge";
import { TableCell, TableRow } from "@ostiary/core/components/ui/table";
import { adminAppIconUrl } from "@/lib/app-icon-url";

function formatDate(format: ReturnType<typeof useFormatter>, iso: string) {
  try {
    return format.dateTime(new Date(iso), {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "-";
  }
}

/** One OAuth consent in the consent table. */
export function ConsentTableRow({
  row,
  onChanged,
}: {
  row: OAuthConsentRow;
  onChanged: () => void;
}) {
  const format = useFormatter();
  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{row.userLabel}</span>
          <code className="text-muted-foreground max-w-[min(100%,280px)] truncate font-mono text-xs">
            {row.userId}
          </code>
          <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
            <span className="text-muted-foreground line-clamp-1 text-xs">
              {row.clientLabel}
            </span>
            <div className="flex flex-wrap gap-1">
              {row.scopes.slice(0, 3).map((s) => (
                <Badge
                  key={s}
                  variant="outline"
                  className="font-mono text-[10px] font-normal"
                >
                  {s}
                </Badge>
              ))}
              {row.scopes.length > 3 ? (
                <Badge variant="secondary" className="text-[10px]">
                  +{row.scopes.length - 3}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <div className="flex items-center gap-2.5">
          <AppIcon name={row.clientLabel} src={adminAppIconUrl(row.clientId)} size={28} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium">
              {row.clientLabel}
            </span>
            <code className="text-muted-foreground max-w-[220px] truncate font-mono text-xs">
              {row.clientId}
            </code>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <div className="flex max-w-md flex-wrap gap-1">
          {row.scopes.map((s) => (
            <Badge
              key={s}
              variant="outline"
              className="font-mono text-xs font-normal"
            >
              {s}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        {row.referenceId ? (
          <code className="text-muted-foreground rounded bg-muted/80 px-1.5 py-0.5 font-mono text-xs break-all">
            {row.referenceId}
          </code>
        ) : (
          <span className="text-muted-foreground text-sm">, </span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground hidden text-sm xl:table-cell">
        {formatDate(format, row.createdAt)}
      </TableCell>
      <TableCell className="text-muted-foreground hidden text-sm xl:table-cell">
        {formatDate(format, row.updatedAt)}
      </TableCell>
      <TableCell className="text-right">
        <AdminConsentRowActions row={row} onChanged={onChanged} />
      </TableCell>
    </TableRow>
  );
}
