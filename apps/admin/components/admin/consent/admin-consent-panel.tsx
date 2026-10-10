"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import type { OAuthConsentRow } from "@/components/admin/consent/admin-consent-row-actions";
import { ConsentTableRow } from "@/components/admin/consent/consent-table-row";
import { TableMessageRow, TablePagination, TableSearch } from "@/components/admin/common/admin-table";
import { useDebouncedValue } from "@/components/admin/common/use-debounced-value";
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

type ConsentScopeFilter = "all" | "offline" | "openid" | "with_reference";

function buildClientNameMap(clientsPayload: unknown): Map<string, string> {
  const map = new Map<string, string>();
  for (const raw of normalizeGetClientsPayload(clientsPayload)) {
    const o = asRecord(raw);
    if (!o) continue;
    const id = String(o.client_id ?? o.clientId ?? "");
    if (!id) continue;
    const name = String(
      o.client_name ?? o.clientName ?? o.name ?? id
    );
    map.set(id, name);
  }
  return map;
}

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number" && Number.isFinite(v)) {
    return new Date(v).toISOString();
  }
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  return new Date().toISOString();
}

function mapConsentRecord(
  raw: unknown,
  clientNames: Map<string, string>,
  userLabel: string
): OAuthConsentRow | null {
  const o = asRecord(raw);
  if (!o) return null;
  const id = String(o.id ?? "");
  if (!id) return null;
  const userId = String(o.userId ?? o.user_id ?? "");
  const clientId = String(o.clientId ?? o.client_id ?? "");
  if (!clientId) return null;
  const referenceIdRaw = o.referenceId ?? o.reference_id;
  const referenceId =
    typeof referenceIdRaw === "string" && referenceIdRaw.trim()
      ? referenceIdRaw
      : undefined;
  const scopes = asStringArray(o.scopes);
  return {
    id,
    userId: userId || ", ",
    userLabel,
    clientId,
    clientLabel: clientNames.get(clientId) ?? clientId,
    referenceId,
    scopes,
    createdAt: toIso(o.createdAt ?? o.created_at),
    updatedAt: toIso(o.updatedAt ?? o.updated_at),
  };
}

function normalizeGetConsentsPayload(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const o = asRecord(data);
  if (o && Array.isArray(o.consents)) return o.consents;
  return [];
}

function hasScope(row: OAuthConsentRow, token: string) {
  return row.scopes.some(
    (s) => s.toLowerCase() === token.toLowerCase()
  );
}

function filterConsents(
  rows: OAuthConsentRow[],
  search: string,
  scopeFilter: ConsentScopeFilter
): OAuthConsentRow[] {
  const q = search.trim().toLowerCase();
  return rows.filter((r) => {
    if (scopeFilter === "offline" && !hasScope(r, "offline_access"))
      return false;
    if (scopeFilter === "openid" && !hasScope(r, "openid")) return false;
    if (scopeFilter === "with_reference" && !r.referenceId?.trim())
      return false;
    if (!q) return true;
    const scopeStr = r.scopes.join(" ").toLowerCase();
    return (
      r.id.toLowerCase().includes(q) ||
      r.userId.toLowerCase().includes(q) ||
      r.userLabel.toLowerCase().includes(q) ||
      r.clientId.toLowerCase().includes(q) ||
      r.clientLabel.toLowerCase().includes(q) ||
      (r.referenceId?.toLowerCase().includes(q) ?? false) ||
      scopeStr.includes(q)
    );
  });
}

export function AdminConsentPanel() {
  const t = useTranslations("admin.pages.consent.panel");
  const tc = useTranslations("admin.common");
  const { data: sessionWrap } = authClient.useSession();
  const userLabel =
    sessionWrap?.user?.email ??
    sessionWrap?.user?.name ??
    sessionWrap?.user?.id ??
    t("signedInUser");

  const [searchInput, setSearchInput] = React.useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [scopeFilter, setScopeFilter] =
    React.useState<ConsentScopeFilter>("all");
  const [rows, setRows] = React.useState<OAuthConsentRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [listError, setListError] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const refetch = React.useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setListError(null);
      const [consentsRes, clientsRes] = await Promise.all([
        authClient.oauth2.getConsents(),
        authClient.oauth2.getClients(),
      ]);
      if (cancelled) return;
      const failure = consentsRes.error
        ? consentsRes.error.message ?? t("loadConsentsFailed")
        : clientsRes.error
          ? clientsRes.error.message ?? t("loadClientsFailed")
          : null;
      if (failure !== null) {
        setListError(failure);
        setRows([]);
        setLoading(false);
        return;
      }
      const clientNames = buildClientNameMap(clientsRes.data);
      const list = normalizeGetConsentsPayload(consentsRes.data)
        .map((raw) => mapConsentRecord(raw, clientNames, userLabel))
        .filter((r): r is OAuthConsentRow => r !== null);
      setRows(list);
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [refreshKey, userLabel, t]);

  const filtered = React.useMemo(
    () => filterConsents(rows, debouncedSearch, scopeFilter),
    [rows, debouncedSearch, scopeFilter]
  );

  const { page, setPage, pageSize, setPageSize, totalPages, pageStart, showingFrom, showingTo } =
    usePagination(filtered.length, [debouncedSearch, scopeFilter]);
  const pageRows = filtered.slice(pageStart, pageStart + pageSize);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <TableSearch
          value={searchInput}
          onChange={setSearchInput}
          placeholder={t("searchPlaceholder")}
          label={t("searchLabel")}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={scopeFilter}
            onValueChange={(v) => setScopeFilter(v as ConsentScopeFilter)}
          >
            <SelectTrigger size="sm" className="w-[200px]">
              <SelectValue placeholder={t("filter.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filter.all")}</SelectItem>
              <SelectItem value="openid">
                {t("filter.hasScope", { scope: "openid" })}
              </SelectItem>
              <SelectItem value="offline">
                {t("filter.hasScope", { scope: "offline_access" })}
              </SelectItem>
              <SelectItem value="with_reference">
                {t("filter.hasScope", { scope: "reference_id" })}
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => refetch()}
          >
            {tc("refresh")}
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
              <TableHead className="w-[min(26%,240px)]">{t("columns.user")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("columns.application")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("columns.scopes")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("columns.reference")}</TableHead>
              <TableHead className="hidden xl:table-cell">{t("columns.granted")}</TableHead>
              <TableHead className="hidden xl:table-cell">{t("columns.updated")}</TableHead>
              <TableHead className="w-12 text-right">{tc("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableMessageRow colSpan={7}>{t("loading")}</TableMessageRow>
            ) : pageRows.length === 0 ? (
              <TableMessageRow colSpan={7}>
                {rows.length === 0 ? t("emptyNone") : t("emptyFiltered")}
              </TableMessageRow>
            ) : (
              pageRows.map((row) => (
                <ConsentTableRow key={row.id} row={row} onChanged={refetch} />
              ))
            )}
          </TableBody>
        </Table>

        <TablePagination
          summary={
            filtered.length === 0
              ? t("noResults")
              : t("showing", { from: showingFrom, to: showingTo, total: filtered.length })
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
            page: t("pageOf", { page: page + 1, total: totalPages }),
          }}
        />
      </div>

      <p className="text-muted-foreground text-xs">
        {t.rich("footnote", {
          getConsents: "authClient.oauth2.getConsents()",
          getClients: "getClients()",
          deleteConsent: "deleteConsent",
          path: "/consent",
          code: (c) => (
            <code className="rounded bg-muted px-1 py-0.5 font-mono">{c}</code>
          ),
          consentLink: (c) => (
            <ExternalLink href="https://better-auth.com/docs/plugins/oauth-provider#list-consent">{c}</ExternalLink>
          ),
          providerLink: (c) => (
            <ExternalLink href="https://better-auth.com/docs/plugins/oauth-provider">{c}</ExternalLink>
          ),
        })}
      </p>
    </div>
  );
}
