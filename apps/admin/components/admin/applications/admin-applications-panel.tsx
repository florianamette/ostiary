"use client";

import * as React from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchIcon,
} from "lucide-react";

import {
  AdminApplicationRowActions,
  type OAuthApplicationRow,
} from "@/components/admin/applications/admin-application-row-actions";
import { AdminRegisterOAuthClientDialog } from "@/components/admin/applications/admin-register-oauth-client-dialog";
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

export type { OAuthApplicationRow };

type ClientKindFilter = "all" | "public" | "confidential" | "trusted";

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
): "none" | "client_secret_basic" | "client_secret_post" {
  if (
    v === "none" ||
    v === "client_secret_basic" ||
    v === "client_secret_post"
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
  };
}

function filterApplications(
  rows: OAuthApplicationRow[],
  search: string,
  kind: ClientKindFilter
): OAuthApplicationRow[] {
  const q = search.trim().toLowerCase();
  return rows.filter((r) => {
    if (kind === "public" && !r.public) return false;
    if (kind === "confidential" && r.public) return false;
    if (kind === "trusted" && !r.skipConsent) return false;
    if (!q) return true;
    const inName = r.name.toLowerCase().includes(q);
    const inId = r.clientId.toLowerCase().includes(q);
    const inRedirect = r.redirectUris.some((u) => u.toLowerCase().includes(q));
    const inGrants = r.grantTypes.some((g) => g.toLowerCase().includes(q));
    return inName || inId || inRedirect || inGrants;
  });
}

export function AdminApplicationsPanel() {
  const [searchInput, setSearchInput] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [kindFilter, setKindFilter] =
    React.useState<ClientKindFilter>("all");
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] =
    React.useState<AdminTablePageSize>(DEFAULT_ADMIN_TABLE_PAGE_SIZE);
  const [rows, setRows] = React.useState<OAuthApplicationRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [listError, setListError] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  React.useEffect(() => {
    setPage(0);
  }, [debouncedSearch, kindFilter, pageSize]);

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
        setListError(res.error.message ?? "Failed to load OAuth clients");
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
  }, [refreshKey]);

  const filtered = React.useMemo(
    () => filterApplications(rows, debouncedSearch, kindFilter),
    [rows, debouncedSearch, kindFilter]
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
            placeholder="Search by name, client ID, redirect URI, or grant…"
            className="pl-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search applications"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={kindFilter}
            onValueChange={(v) => setKindFilter(v as ClientKindFilter)}
          >
            <SelectTrigger size="sm" className="w-[160px]">
              <SelectValue placeholder="Client type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="confidential">Confidential</SelectItem>
              <SelectItem value="trusted">Trusted (skip consent)</SelectItem>
            </SelectContent>
          </Select>
          <AdminRegisterOAuthClientDialog onCreated={refetch} />
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
          <AlertTitle>Could not load applications</AlertTitle>
          <AlertDescription>{listError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-xl border border-border/80 bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[min(30%,280px)]">Application</TableHead>
              <TableHead className="hidden sm:table-cell">Client type</TableHead>
              <TableHead className="hidden md:table-cell">Redirects</TableHead>
              <TableHead className="hidden lg:table-cell">Grants</TableHead>
              <TableHead className="hidden lg:table-cell">Consent</TableHead>
              <TableHead className="hidden md:table-cell">Status</TableHead>
              <TableHead className="hidden xl:table-cell">Created</TableHead>
              <TableHead className="w-12 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-muted-foreground"
                >
                  Loading applications…
                </TableCell>
              </TableRow>
            ) : pageRows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-muted-foreground"
                >
                  {rows.length === 0
                    ? "No OAuth clients for this account yet."
                    : "No applications match your filters."}
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row) => (
                <TableRow key={row.clientId}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{row.name}</span>
                      <code className="text-muted-foreground max-w-[min(100%,320px)] truncate font-mono text-xs">
                        {row.clientId}
                      </code>
                      <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                        <Badge variant={row.public ? "secondary" : "default"}>
                          {row.public ? "Public" : "Confidential"}
                        </Badge>
                        {row.skipConsent ? (
                          <Badge variant="outline">Trusted</Badge>
                        ) : (
                          <Badge variant="outline" className="font-normal">
                            Consent
                          </Badge>
                        )}
                        {row.disabled ? (
                          <Badge variant="destructive">Disabled</Badge>
                        ) : (
                          <Badge variant="outline" className="font-normal">
                            Active
                          </Badge>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex flex-col gap-1">
                      <Badge variant={row.public ? "secondary" : "default"}>
                        {row.public ? "Public" : "Confidential"}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {row.tokenEndpointAuthMethod === "none"
                          ? "auth: none"
                          : row.tokenEndpointAuthMethod ===
                              "client_secret_basic"
                            ? "auth: secret (basic)"
                            : "auth: secret (post)"}
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
                        >
                          {g}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {row.skipConsent ? (
                      <Badge variant="secondary">Skipped</Badge>
                    ) : (
                      <Badge variant="outline" className="font-normal">
                        Required
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {row.disabled ? (
                      <Badge variant="destructive">Disabled</Badge>
                    ) : (
                      <Badge variant="outline" className="font-normal">
                        Active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-sm xl:table-cell">
                    {formatDate(row.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
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
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex flex-col gap-3 border-t px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <p className="text-muted-foreground text-xs sm:text-sm">
            {filtered.length === 0
              ? "0 applications"
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
          authClient.oauth2.getClients()
        </code>
        . Register and edit (including{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono">
          skip_consent
        </code>
        ) call{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono">
          POST /api/admin/oauth-clients
        </code>{" "}
        and{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono">
          PATCH /api/admin/oauth-clients/[clientId]
        </code>
        ; other mutations use{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono">
          deleteClient
        </code>{" "}
        and{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono">
          client.rotateSecret
        </code>
        . See the{" "}
        <a
          href="https://better-auth.com/docs/plugins/oauth-provider#list-clients"
          className="font-medium text-foreground underline-offset-4 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          OAuth provider
        </a>{" "}
        docs. Clients are scoped to the signed-in user (or{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono">
          clientReference
        </code>{" "}
        when configured).
      </p>
    </div>
  );
}
