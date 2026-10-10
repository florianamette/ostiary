"use client";

import { useFormatter, useTranslations } from "next-intl";

import {
  AdminApplicationRowActions,
  type OAuthApplicationRow,
} from "@/components/admin/applications/admin-application-row-actions";
import { SelfRegisteredRowActions } from "@/components/admin/applications/self-registered-row-actions";
import { AppIcon } from "@ostiary/core/components/app-icon";
import { Badge } from "@ostiary/core/components/ui/badge";
import { TableCell, TableRow } from "@ostiary/core/components/ui/table";
import { adminAppIconUrl } from "@/lib/app-icon-url";
import { DEVICE_CODE_GRANT_TYPE } from "@ostiary/core/lib/admin/oauth-clients/oauth-client-admin.types";
import type { RegistrationSource } from "@ostiary/core/lib/client-registration-policy";

/** Grant badge text: the device grant is a long URN, show its short name. */
function grantLabel(grant: string) {
  return grant === DEVICE_CODE_GRANT_TYPE ? "device_code" : grant;
}

/** Badge for a client that registered itself; admin-registered clients get none. */
function RegistrationBadge({ source }: { source: RegistrationSource }) {
  const t = useTranslations("admin.pages.applications.panel");
  if (source === "admin") return null;
  return (
    <Badge
      variant="outline"
      className="border-amber-500/40 bg-amber-500/10 font-normal text-amber-800 dark:text-amber-300"
      title={t("selfRegisteredHint")}
    >
      {source === "dynamic" ? t("selfRegisteredBadge") : t("registration.metadata_document")}
    </Badge>
  );
}

function summarizeRedirects(uris: string[]) {
  if (uris.length === 0) return "-";
  if (uris.length === 1) return uris[0];
  return `${uris[0]} +${uris.length - 1}`;
}

function KindBadge({ row }: { row: OAuthApplicationRow }) {
  const t = useTranslations("admin.pages.applications.panel");
  return (
    <Badge variant={row.public ? "secondary" : "default"}>
      {row.public ? t("kind.public") : t("kind.confidential")}
    </Badge>
  );
}

function StatusBadge({ row }: { row: OAuthApplicationRow }) {
  const t = useTranslations("admin.pages.applications.panel");
  const tCommon = useTranslations("admin.common");
  return row.disabled ? (
    <Badge variant="destructive">{tCommon("disabled")}</Badge>
  ) : (
    <Badge variant="outline" className="font-normal">
      {t("badges.active")}
    </Badge>
  );
}

/**
 * One OAuth client in the applications table.
 *
 * @param linkedApis The APIs this application is linked to on the APIs page.
 */
export function ApplicationTableRow({
  row,
  linkedApis,
  onChanged,
}: {
  row: OAuthApplicationRow;
  linkedApis: string[] | undefined;
  onChanged: () => void;
}) {
  const t = useTranslations("admin.pages.applications.panel");
  const format = useFormatter();

  function formatDate(iso: string) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "-";
    return format.dateTime(date, { year: "numeric", month: "short", day: "numeric" });
  }

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-start gap-2.5">
          <AppIcon name={row.name} src={adminAppIconUrl(row.clientId, row.logoUri)} size={28} className="mt-0.5" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="font-medium">{row.name}</span>
            {row.registration !== "admin" ? (
              <span className="mb-0.5">
                <RegistrationBadge source={row.registration} />
              </span>
            ) : null}
            <code className="text-muted-foreground max-w-[min(100%,320px)] truncate font-mono text-xs">
              {row.clientId}
            </code>
            {linkedApis?.length ? (
              <span className="text-muted-foreground text-xs">
                {t("linkedApis", { apis: linkedApis.join(", ") })}
              </span>
            ) : null}
            <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
              <KindBadge row={row} />
              {row.grantTypes.includes(DEVICE_CODE_GRANT_TYPE) ? (
                <Badge variant="outline">{t("badges.device")}</Badge>
              ) : null}
              {row.skipConsent ? (
                <Badge variant="outline">{t("badges.trusted")}</Badge>
              ) : (
                <Badge variant="outline" className="font-normal">
                  {t("badges.consent")}
                </Badge>
              )}
              <StatusBadge row={row} />
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <div className="flex flex-col gap-1">
          <KindBadge row={row} />
          <span className="text-muted-foreground text-xs">
            {t(`authMethod.${row.tokenEndpointAuthMethod}`)}
          </span>
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <span
          className="line-clamp-2 text-sm break-all"
          title={row.redirectUris.join("\n")}
        >
          {summarizeRedirects(row.redirectUris)}
        </span>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <div className="flex flex-wrap gap-1">
          {row.grantTypes.map((g) => (
            <Badge
              key={g}
              variant="outline"
              className="font-mono text-xs font-normal"
              title={g}
            >
              {grantLabel(g)}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        {row.skipConsent ? (
          <Badge variant="secondary">{t("badges.skipped")}</Badge>
        ) : (
          <Badge variant="outline" className="font-normal">
            {t("badges.required")}
          </Badge>
        )}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <StatusBadge row={row} />
      </TableCell>
      <TableCell className="text-muted-foreground hidden text-sm xl:table-cell">
        {formatDate(row.createdAt)}
      </TableCell>
      <TableCell className="text-right">
        {row.registration === "admin" ? (
          <AdminApplicationRowActions row={row} onChanged={onChanged} />
        ) : (
          <SelfRegisteredRowActions row={row} />
        )}
      </TableCell>
    </TableRow>
  );
}
