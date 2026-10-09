"use client";

import * as React from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import {
  AdminApplicationRowActions,
  type OAuthApplicationRow,
} from "@/components/admin/applications/admin-application-row-actions";
import { AdminRegisterOAuthClientDialog } from "@/components/admin/applications/admin-register-oauth-client-dialog";
import { SelfRegisteredRowActions } from "@/components/admin/applications/self-registered-row-actions";
import { AppIcon } from "@ostiary/core/components/app-icon";
import { Alert, AlertDescription, AlertTitle } from "@ostiary/core/components/ui/alert";
import { Badge } from "@ostiary/core/components/ui/badge";
import { Button } from "@ostiary/core/components/ui/button";
import { Input } from "@ostiary/core/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ostiary/core/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ostiary/core/components/ui/table";
import {
  ADMIN_TABLE_PAGE_SIZES,
  DEFAULT_ADMIN_TABLE_PAGE_SIZE,
  type AdminTablePageSize,
} from "@ostiary/core/lib/admin/admin-table-page-size";
import { adminAppIconUrl } from "@/lib/app-icon-url";
import { authClient } from "@/lib/auth-client";
import { adminNotify } from "@ostiary/core/lib/admin/admin-notify";
import { DEVICE_CODE_GRANT_TYPE } from "@ostiary/core/lib/admin/oauth-clients/oauth-client-admin.types";
import type { RegistrationSource } from "@ostiary/core/lib/client-registration-policy";

export type { OAuthApplicationRow };

type ClientKindFilter = "all" | "public" | "confidential" | "trusted" | "device";
type RegistrationFilter = "all" | "self" | RegistrationSource;

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

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

/** Response from `getClients` is an array of RFC-style client objects (snake_case). */
function normalizeGetClientsPayload(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const o = asRecord(data);
  if (o && Array.isArray(o.clients)) return o.clients;
  return [];
}

function normalizeAuthMethod(
  v: unknown
): OAuthApplicationRow["tokenEndpointAuthMethod"] {
  if (
    v === "none" ||
    v === "client_secret_basic" ||
    v === "client_secret_post" ||
    v === "private_key_jwt"
  ) {
    return v;
  }
  return "client_secret_basic";
}

function mapApiClientToRow(raw: unknown): OAuthApplicationRow | null {
  const o = asRecord(raw);
  if (!o) return null;
  const clientId = String(o.client_id ?? o.clientId ?? "");
  if (!clientId) return null;
  const name = String(
    o.client_name ?? o.clientName ?? o.name ?? clientId
  );
  const skipConsent = o.skip_consent === true || o.skipConsent === true;
  const disabled = o.disabled === true;
  const tokenEndpointAuthMethod =
    o.token_endpoint_auth_method ?? o.tokenEndpointAuthMethod;
  // Better Auth 1.7 dropped the `public` flag: a client with no secret ("none") is public.
  const publicClient = o.public === true || tokenEndpointAuthMethod === "none";
  const grantTypes = asStringArray(o.grant_types ?? o.grantTypes);
  const redirectUris = asStringArray(o.redirect_uris ?? o.redirectUris);
  const issuedAt = o.client_id_issued_at ?? o.clientIdIssuedAt;
  let createdAt: string;
  if (typeof issuedAt === "number" && Number.isFinite(issuedAt)) {
    createdAt = new Date(issuedAt * 1000).toISOString();
  } else {
    const ca = o.createdAt;
    if (ca instanceof Date) {
      createdAt = ca.toISOString();
    } else if (typeof ca === "string" || typeof ca === "number") {
      createdAt = new Date(ca).toISOString();
    } else {
      createdAt = new Date().toISOString();
    }
  }
  return {
    clientId,
    name,
    public: publicClient,
    skipConsent,
    disabled,
    tokenEndpointAuthMethod: publicClient
      ? "none"
      : normalizeAuthMethod(tokenEndpointAuthMethod),
    grantTypes,
    redirectUris,
    createdAt,
    // Dynamic clients carry the marker in their metadata, which Better Auth returns inline.
    registration: o.ostiary_registration === "dynamic" ? "dynamic" : "admin",
  };
}

function filterApplications(
  rows: OAuthApplicationRow[],
  search: string,
  kind: ClientKindFilter,
  registration: RegistrationFilter
): OAuthApplicationRow[] {
  const q = search.trim().toLowerCase();
  return rows.filter((r) => {
    if (registration === "self" && r.registration === "admin") return false;
    if (registration !== "all" && registration !== "self" && r.registration !== registration) return false;
    if (kind === "public" && !r.public) return false;
    if (kind === "confidential" && r.public) return false;
    if (kind === "trusted" && !r.skipConsent) return false;
    if (kind === "device" && !r.grantTypes.includes(DEVICE_CODE_GRANT_TYPE)) return false;
    if (!q) return true;
    const inName = r.name.toLowerCase().includes(q);
    const inId = r.clientId.toLowerCase().includes(q);
    const inRedirect = r.redirectUris.some((u) => u.toLowerCase().includes(q));
    const inGrants = r.grantTypes.some((g) => g.toLowerCase().includes(q));
    return inName || inId || inRedirect || inGrants;
  });
}

/**
 * Lists the OAuth clients: the signed-in admin's (from Better Auth's `getClients`) and every
 * self-registered one (`selfRegistered`, loaded on the server: they have no owner).
 *
 * @param linkedApis API names per client id: the APIs each application is linked to on the
 * APIs page. APIs open to every application are not listed.
 */
export function AdminApplicationsPanel({
  initialSearch = "",
  linkedApis = {},
  selfRegistered,
}: {
  /** Prefilled search, e.g. a client ID from the App usage page (`?q=`). */
  initialSearch?: string;
  linkedApis?: Record<string, string[]>;
  selfRegistered: OAuthApplicationRow[];
}) {
  const t = useTranslations("admin.pages.applications.panel");
  const tCommon = useTranslations("admin.common");
  const format = useFormatter();
  const [searchInput, setSearchInput] = React.useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = React.useState(initialSearch);
  const [kindFilter, setKindFilter] =
    React.useState<ClientKindFilter>("all");
  const [registrationFilter, setRegistrationFilter] =
    React.useState<RegistrationFilter>("all");
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] =
    React.useState<AdminTablePageSize>(DEFAULT_ADMIN_TABLE_PAGE_SIZE);
  const [rows, setRows] = React.useState<OAuthApplicationRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [listError, setListError] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  React.useEffect(() => {
    setPage(0);
  }, [debouncedSearch, kindFilter, registrationFilter, pageSize]);

  const refetch = React.useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setListError(null);
      const res = await authClient.oauth2.getClients();
      if (cancelled) return;
      if (res.error) {
        setListError(res.error.message ?? t("loadFailed"));
        setRows([]);
        setLoading(false);
        return;
      }
      const list = normalizeGetClientsPayload(res.data)
        .map(mapApiClientToRow)
        .filter((r): r is OAuthApplicationRow => r !== null);
      setRows(list);
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [refreshKey, t]);

  // Self-registered rows come from the server and win over the same client in `rows`.
  const allRows = React.useMemo(() => {
    const byId = new Map(rows.map((row) => [row.clientId, row]));
    for (const row of selfRegistered) byId.set(row.clientId, row);
    return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [rows, selfRegistered]);

  const filtered = React.useMemo(
    () => filterApplications(allRows, debouncedSearch, kindFilter, registrationFilter),
    [allRows, debouncedSearch, kindFilter, registrationFilter]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * pageSize;
  const pageRows = filtered.slice(pageStart, pageStart + pageSize);
  const showingFrom = filtered.length === 0 ? 0 : pageStart + 1;
  const showingTo = Math.min(pageStart + pageSize, filtered.length);

  React.useEffect(() => {
    if (page > safePage) setPage(safePage);
  }, [page, safePage]);

  function formatDate(iso: string) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "-";
    return format.dateTime(date, { year: "numeric", month: "short", day: "numeric" });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder={t("searchPlaceholder")}
            className="pl-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label={t("searchLabel")}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={kindFilter}
            onValueChange={(v) => setKindFilter(v as ClientKindFilter)}
          >
            <SelectTrigger size="sm" className="w-[160px]">
              <SelectValue placeholder={t("clientType")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("kind.all")}</SelectItem>
              <SelectItem value="public">{t("kind.public")}</SelectItem>
              <SelectItem value="confidential">{t("kind.confidential")}</SelectItem>
              <SelectItem value="trusted">{t("kind.trusted")}</SelectItem>
              <SelectItem value="device">{t("kind.device")}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={registrationFilter}
            onValueChange={(v) => setRegistrationFilter(v as RegistrationFilter)}
          >
            <SelectTrigger size="sm" className="w-[190px]" aria-label={t("registeredBy")}>
              <SelectValue placeholder={t("registeredBy")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("registration.all")}</SelectItem>
              <SelectItem value="admin">{t("registration.admin")}</SelectItem>
              <SelectItem value="self">{t("selfRegisteredBadge")}</SelectItem>
              <SelectItem value="dynamic">{t("registration.dynamic")}</SelectItem>
              <SelectItem value="metadata_document">{t("registration.metadata_document")}</SelectItem>
            </SelectContent>
          </Select>
          <AdminRegisterOAuthClientDialog onCreated={refetch} />
          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => refetch()}
          >
            {tCommon("refresh")}
          </Button>
        </div>
      </div>

      {listError ? (
        <Alert variant="destructive">
          <AlertTitle>{t("loadErrorTitle")}</AlertTitle>
          <AlertDescription>{listError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-xl border border-border/80 bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[min(30%,280px)]">{t("columns.application")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("clientType")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("columns.redirects")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("columns.grants")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("columns.consent")}</TableHead>
              <TableHead className="hidden md:table-cell">{tCommon("status")}</TableHead>
              <TableHead className="hidden xl:table-cell">{tCommon("created")}</TableHead>
              <TableHead className="w-12 text-right">{tCommon("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-muted-foreground"
                >
                  {t("loadingRows")}
                </TableCell>
              </TableRow>
            ) : pageRows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-muted-foreground"
                >
                  {allRows.length === 0
                    ? t("empty")
                    : t("noMatch")}
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row) => (
                <TableRow key={row.clientId}>
                  <TableCell>
                    <div className="flex items-start gap-2.5">
                      <AppIcon name={row.name} src={adminAppIconUrl(row.clientId)} size={28} className="mt-0.5" />
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
                        {linkedApis[row.clientId]?.length ? (
                          <span className="text-muted-foreground text-xs">
                            {t("linkedApis", { apis: linkedApis[row.clientId].join(", ") })}
                          </span>
                        ) : null}
                        <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                          <Badge variant={row.public ? "secondary" : "default"}>
                            {row.public ? t("kind.public") : t("kind.confidential")}
                          </Badge>
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
                          {row.disabled ? (
                            <Badge variant="destructive">{tCommon("disabled")}</Badge>
                          ) : (
                            <Badge variant="outline" className="font-normal">
                              {t("badges.active")}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex flex-col gap-1">
                      <Badge variant={row.public ? "secondary" : "default"}>
                        {row.public ? t("kind.public") : t("kind.confidential")}
                      </Badge>
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
                    {row.disabled ? (
                      <Badge variant="destructive">{tCommon("disabled")}</Badge>
                    ) : (
                      <Badge variant="outline" className="font-normal">
                        {t("badges.active")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-sm xl:table-cell">
                    {formatDate(row.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.registration === "admin" ? (
                      <AdminApplicationRowActions
                        row={row}
                        onChanged={refetch}
                        onNotify={(message, variant = "success") => {
                          adminNotify(
                            message,
                            variant === "error" ? "error" : "success"
                          );
                        }}
                      />
                    ) : (
                      <SelfRegisteredRowActions row={row} />
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex flex-col gap-3 border-t px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <p className="text-muted-foreground text-xs sm:text-sm">
            {filtered.length === 0
              ? t("noApplications")
              : t("showing", { from: showingFrom, to: showingTo, total: filtered.length })}
          </p>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground whitespace-nowrap text-xs">
                {t("rowsPerPage")}
              </span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) =>
                  setPageSize(Number(v) as AdminTablePageSize)
                }
              >
                <SelectTrigger
                  size="sm"
                  className="w-[88px]"
                  aria-label={t("rowsPerPage")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADMIN_TABLE_PAGE_SIZES.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={loading || safePage <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeftIcon />
                {t("previous")}
              </Button>
              <span className="text-muted-foreground tabular-nums text-xs sm:text-sm">
                {t("page", { page: safePage + 1, total: totalPages })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={loading || safePage >= totalPages - 1}
                onClick={() =>
                  setPage((p) => Math.min(totalPages - 1, p + 1))
                }
              >
                {t("next")}
                <ChevronRightIcon />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        {t.rich("footnote", {
          getClients: "authClient.oauth2.getClients()",
          skipConsent: "skip_consent",
          create: "POST /api/admin/oauth-clients",
          update: "PATCH /api/admin/oauth-clients/[clientId]",
          deleteClient: "deleteClient",
          rotateSecret: "client.rotateSecret",
          clientReference: "clientReference",
          code: (chunks) => <code className="rounded bg-muted px-1 py-0.5 font-mono">{chunks}</code>,
          docs: (chunks) => (
            <a
              href="https://better-auth.com/docs/plugins/oauth-provider#list-clients"
              className="font-medium text-foreground underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {chunks}
            </a>
          ),
        })}
      </p>
    </div>
  );
}
