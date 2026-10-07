"use client";

import * as React from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchIcon,
} from "lucide-react";

import {
  AdminConsentRowActions,
  type OAuthConsentRow,
} from "@/components/admin/consent/admin-consent-row-actions";
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
import { authClient } from "@/lib/auth-client";
import { adminNotify } from "@ostiary/core/lib/admin/admin-notify";

export type { OAuthConsentRow };

type ConsentScopeFilter = "all" | "offline" | "openid" | "with_reference";

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "-";
  }
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

function normalizeGetClientsPayload(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const o = asRecord(data);
  if (o && Array.isArray(o.clients)) return o.clients;
  return [];
}

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
  const { data: sessionWrap } = authClient.useSession();
  const userLabel =
    sessionWrap?.user?.email ??
    sessionWrap?.user?.name ??
    sessionWrap?.user?.id ??
    "Signed-in user";

  const [searchInput, setSearchInput] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [scopeFilter, setScopeFilter] =
    React.useState<ConsentScopeFilter>("all");
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] =
    React.useState<AdminTablePageSize>(DEFAULT_ADMIN_TABLE_PAGE_SIZE);
  const [rows, setRows] = React.useState<OAuthConsentRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [listError, setListError] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  React.useEffect(() => {
    setPage(0);
  }, [debouncedSearch, scopeFilter, pageSize]);

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
      if (consentsRes.error) {
        setListError(
          consentsRes.error.message ?? "Failed to load consents"
        );
        setRows([]);
        setLoading(false);
        return;
      }
      if (clientsRes.error) {
        setListError(
          clientsRes.error.message ?? "Failed to load OAuth clients"
        );
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
  }, [refreshKey, userLabel]);

  const filtered = React.useMemo(
    () => filterConsents(rows, debouncedSearch, scopeFilter),
    [rows, debouncedSearch, scopeFilter]
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by user, client, consent id, reference, or scope…"
            className="pl-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search consents"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={scopeFilter}
            onValueChange={(v) => setScopeFilter(v as ConsentScopeFilter)}
          >
            <SelectTrigger size="sm" className="w-[200px]">
              <SelectValue placeholder="Scope filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All consents</SelectItem>
              <SelectItem value="openid">Has openid</SelectItem>
              <SelectItem value="offline">Has offline_access</SelectItem>
              <SelectItem value="with_reference">Has reference_id</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => refetch()}
          >
            Refresh
          </Button>
        </div>
      </div>

      {listError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load consents</AlertTitle>
          <AlertDescription>{listError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-xl border border-border/80 bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[min(26%,240px)]">User</TableHead>
              <TableHead className="hidden sm:table-cell">Application</TableHead>
              <TableHead className="hidden lg:table-cell">Scopes</TableHead>
              <TableHead className="hidden md:table-cell">Reference</TableHead>
              <TableHead className="hidden xl:table-cell">Granted</TableHead>
              <TableHead className="hidden xl:table-cell">Updated</TableHead>
              <TableHead className="w-12 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  Loading consents…
                </TableCell>
              </TableRow>
            ) : pageRows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  {rows.length === 0
                    ? "No consents recorded for this account yet."
                    : "No consents match your filters."}
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row) => (
                <TableRow key={row.id}>
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
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">
                        {row.clientLabel}
                      </span>
                      <code className="text-muted-foreground max-w-[220px] truncate font-mono text-xs">
                        {row.clientId}
                      </code>
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
                    {formatDate(row.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-sm xl:table-cell">
                    {formatDate(row.updatedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <AdminConsentRowActions
                      row={row}
                      onChanged={refetch}
                      onNotify={(message, variant = "success") => {
                        adminNotify(
                          message,
                          variant === "error" ? "error" : "success"
                        );
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex flex-col gap-3 border-t px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <p className="text-muted-foreground text-xs sm:text-sm">
            {filtered.length === 0
              ? "0 consents"
              : `Showing ${showingFrom}-${showingTo} of ${filtered.length}`}
          </p>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground whitespace-nowrap text-xs">
                Rows per page
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
                  aria-label="Rows per page"
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
                Previous
              </Button>
              <span className="text-muted-foreground tabular-nums text-xs sm:text-sm">
                Page {safePage + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={loading || safePage >= totalPages - 1}
                onClick={() =>
                  setPage((p) => Math.min(totalPages - 1, p + 1))
                }
              >
                Next
                <ChevronRightIcon />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        Data from{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono">
          authClient.oauth2.getConsents()
        </code>
        ; client names resolved via{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono">
          getClients()
        </code>
        . Revoke uses{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono">
          deleteConsent
        </code>
        . See{" "}
        <a
          href="https://better-auth.com/docs/plugins/oauth-provider#list-consent"
          className="font-medium text-foreground underline-offset-4 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          OAuth consent
        </a>{" "}
        in the{" "}
        <a
          href="https://better-auth.com/docs/plugins/oauth-provider"
          className="font-medium text-foreground underline-offset-4 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          OAuth provider
        </a>{" "}
        docs. The interactive authorize UI is at{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono">/consent</code>
        .
      </p>
    </div>
  );
}
