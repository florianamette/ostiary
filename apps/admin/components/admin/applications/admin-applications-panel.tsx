"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import type { OAuthApplicationRow } from "@/components/admin/applications/admin-application-row-actions";
import {
  AdminRegisterOAuthClientDialog,
  type MachineScopeOptions,
} from "@/components/admin/applications/admin-register-oauth-client-dialog";
import { ApplicationTableRow } from "@/components/admin/applications/application-table-row";
import { RemoveDuplicatesDialog } from "@/components/admin/applications/remove-duplicates-dialog";
import { ListSearch, TableMessageRow, TablePagination } from "@/components/admin/common/admin-table";
import { readChoice } from "@/components/admin/common/list-params";
import { useAdminList } from "@/components/admin/common/use-admin-list";
import { useListParams } from "@/components/admin/common/use-list-params";
import { usePagination } from "@/components/admin/common/use-pagination";
import { ExternalLink } from "@/components/admin/common/external-link";
import { Alert, AlertDescription, AlertTitle } from "@ostiary/core/components/ui/alert";
import { Button } from "@ostiary/core/components/ui/button";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@ostiary/core/components/ui/table";
import { authClient } from "@/lib/auth-client";
import { asRecord, asStringArray, normalizeGetClientsPayload } from "@/lib/oauth-client-payload";
import {
  DEVICE_CODE_GRANT_TYPE,
  isMachineClient,
} from "@ostiary/core/lib/admin/oauth-clients/oauth-client-admin.types";
import type { RegistrationSource } from "@ostiary/core/lib/client-registration-policy";

const KIND_FILTERS = ["all", "public", "confidential", "machine", "trusted", "device"] as const;
type ClientKindFilter = (typeof KIND_FILTERS)[number];
const REGISTRATION_FILTERS = ["all", "self", "admin", "dynamic", "metadata_document"] as const;
type RegistrationFilter = "all" | "self" | RegistrationSource;

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
  const enableEndSession = o.enable_end_session === true || o.enableEndSession === true;
  const postLogoutRedirectUris = asStringArray(o.post_logout_redirect_uris ?? o.postLogoutRedirectUris);
  const logoUri = typeof o.logo_uri === "string" && o.logo_uri ? o.logo_uri : null;
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
    enableEndSession,
    postLogoutRedirectUris,
    logoUri,
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
    if (kind === "confidential" && (r.public || isMachineClient(r.grantTypes))) return false;
    if (kind === "machine" && !isMachineClient(r.grantTypes)) return false;
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
 * Groups rows sharing a dedupe key (two or more). `visible` keeps the first row of each group
 * (its head: rows are newest first) unless the group is expanded.
 */
function collapseDuplicates(rows: OAuthApplicationRow[], expanded: ReadonlySet<string>) {
  const groupSizes = new Map<string, number>();
  for (const row of rows) {
    if (row.dedupeKey) groupSizes.set(row.dedupeKey, (groupSizes.get(row.dedupeKey) ?? 0) + 1);
  }
  for (const [key, size] of groupSizes) if (size < 2) groupSizes.delete(key);
  const groupHeads = new Set<string>();
  const seen = new Set<string>();
  const visible = rows.filter((row) => {
    const key = row.dedupeKey;
    if (!key || !groupSizes.has(key)) return true;
    if (!seen.has(key)) {
      seen.add(key);
      groupHeads.add(row.clientId);
      return true;
    }
    return expanded.has(key);
  });
  return { visible, groupSizes, groupHeads };
}

/**
 * Lists the OAuth clients: the admin-registered ones (Better Auth's `getClients`, which returns
 * the platform's clients to any admin) and every other one (`selfRegistered`, loaded on the
 * server).
 *
 * @param linkedApis API names per client id: the APIs each application is linked to on the
 * APIs page. APIs open to every application are not listed.
 * @param machineScopes The APIs and scopes a new machine-to-machine client may be given.
 */
export function AdminApplicationsPanel({
  linkedApis = {},
  machineScopes = { apis: [], otherScopes: [] },
  selfRegistered,
}: {
  linkedApis?: Record<string, string[]>;
  machineScopes?: MachineScopeOptions;
  selfRegistered: OAuthApplicationRow[];
}) {
  const t = useTranslations("admin.pages.applications.panel");
  const tCommon = useTranslations("admin.common");
  // Search (`?q=`, also linked from the App usage page), filters and page live in the URL.
  const list = useListParams();
  const search = list.get("q");
  const kindFilter = readChoice({ kind: list.get("kind") }, "kind", KIND_FILTERS, "all");
  const registrationFilter = readChoice(
    { registration: list.get("registration") },
    "registration",
    REGISTRATION_FILTERS,
    "all",
  );

  const loadClients = React.useCallback(async () => {
    const res = await authClient.oauth2.getClients();
    if (res.error) throw new Error(res.error.message || t("loadFailed"));
    return normalizeGetClientsPayload(res.data)
      .map(mapApiClientToRow)
      .filter((r): r is OAuthApplicationRow => r !== null);
  }, [t]);
  const { data: rows, loading, error: listError, reload: refetch } = useAdminList(loadClients, []);

  // Self-registered rows come from the server and win over the same client in `rows`.
  const allRows = React.useMemo(() => {
    const byId = new Map(rows.map((row) => [row.clientId, row]));
    for (const row of selfRegistered) byId.set(row.clientId, row);
    return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [rows, selfRegistered]);

  const filtered = React.useMemo(
    () => filterApplications(allRows, search, kindFilter, registrationFilter),
    [allRows, search, kindFilter, registrationFilter]
  );

  // Identical self-registered clients ("Claude" registered on every connection) collapse into
  // their newest row, which shows how many there are and expands the group.
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(new Set());
  const { visible, groupSizes, groupHeads } = React.useMemo(
    () => collapseDuplicates(filtered, expanded),
    [filtered, expanded]
  );
  const hasDuplicates = React.useMemo(
    () => collapseDuplicates(selfRegistered, new Set()).groupSizes.size > 0,
    [selfRegistered]
  );
  const toggleGroup = React.useCallback((key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);

  const { page, setPage, pageSize, setPageSize, totalPages, pageStart, showingFrom, showingTo } =
    usePagination(visible.length, list);
  const pageRows = visible.slice(pageStart, pageStart + pageSize);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <ListSearch list={list} placeholder={t("searchPlaceholder")} label={t("searchLabel")} />
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={kindFilter}
            onValueChange={(v) => list.set({ kind: v === "all" ? null : v })}
          >
            <SelectTrigger size="sm" className="w-[160px]">
              <SelectValue placeholder={t("clientType")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("kind.all")}</SelectItem>
              <SelectItem value="public">{t("kind.public")}</SelectItem>
              <SelectItem value="confidential">{t("kind.confidential")}</SelectItem>
              <SelectItem value="machine">{t("kind.machine")}</SelectItem>
              <SelectItem value="trusted">{t("kind.trusted")}</SelectItem>
              <SelectItem value="device">{t("kind.device")}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={registrationFilter}
            onValueChange={(v) => list.set({ registration: v === "all" ? null : v })}
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
          {hasDuplicates ? <RemoveDuplicatesDialog /> : null}
          <AdminRegisterOAuthClientDialog machineScopes={machineScopes} onCreated={refetch} />
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
              <TableMessageRow colSpan={8}>{t("loadingRows")}</TableMessageRow>
            ) : pageRows.length === 0 ? (
              <TableMessageRow colSpan={8}>
                {allRows.length === 0 ? t("empty") : t("noMatch")}
              </TableMessageRow>
            ) : (
              pageRows.map((row) => (
                <ApplicationTableRow
                  key={row.clientId}
                  row={row}
                  linkedApis={linkedApis[row.clientId]}
                  onChanged={refetch}
                  duplicates={
                    row.dedupeKey && groupHeads.has(row.clientId)
                      ? {
                          count: groupSizes.get(row.dedupeKey) ?? 1,
                          expanded: expanded.has(row.dedupeKey),
                          onToggle: () => toggleGroup(row.dedupeKey!),
                        }
                      : undefined
                  }
                />
              ))
            )}
          </TableBody>
        </Table>

        <TablePagination
          summary={
            visible.length === 0
              ? t("noApplications")
              : t("showing", { from: showingFrom, to: showingTo, total: visible.length })
          }
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          loading={loading}
          labels={{
            rowsPerPage: t("rowsPerPage"),
            previous: t("previous"),
            next: t("next"),
            page: t("page", { page: page + 1, total: totalPages }),
          }}
        />
      </div>

      <p className="text-muted-foreground text-xs">
        {t.rich("footnote", {
          getClients: "authClient.oauth2.getClients()",
          skipConsent: "skip_consent",
          create: "POST /api/admin/oauth-clients",
          update: "PATCH /api/admin/oauth-clients/[clientId]",
          deleteClient: "DELETE /api/admin/oauth-clients/[clientId]",
          rotateSecret: "POST /api/admin/oauth-clients/[clientId]/rotate-secret",
          clientReference: "clientReference",
          code: (chunks) => <code className="rounded bg-muted px-1 py-0.5 font-mono">{chunks}</code>,
          docs: (chunks) => (
            <ExternalLink href="https://better-auth.com/docs/plugins/oauth-provider#list-clients">{chunks}</ExternalLink>
          ),
        })}
      </p>
    </div>
  );
}
