import { NextResponse } from "next/server";

import { assertAdminWriteRateLimit } from "@ostiary/core/lib/api/admin-write-rate-limit";
import { isAllowedOrigin, isJsonContentType, isSafeMethod, originOf } from "@ostiary/core/lib/api/request-checks";
import { assertRequestBodyWithinLimit } from "@ostiary/core/lib/api/request-body-limit";
import { recordAudit, type AuditEntry } from "@ostiary/core/lib/audit";
import { clientIp } from "@ostiary/core/lib/auth-events";
import { env } from "@ostiary/core/lib/env";
import { handleError, ValidationError } from "@ostiary/core/lib/errors";
import { requireAdminApiRequest } from "@/lib/require-admin-api-request";

/*
 * The admin app's JSON API (/api/admin/*). Unlike server actions, route handlers get no
 * built-in Origin check, and the session cookie may be sent from any subdomain of
 * COOKIE_DOMAIN (same-site). So every write here must come from the admin console's own
 * origin, with a JSON body: a form or a `text/plain` fetch from another page is refused
 * before the session is even read.
 */

type Actor = { id: string; email: string };

export type AdminRouteContext<P> = {
  request: Request;
  params: P;
  actor: Actor;
  /** The request's headers, for Better Auth calls made in the admin's name. */
  requestHeaders: Headers;
  /** The parsed JSON body; undefined unless the route asked for one (`body: true`). */
  body: unknown;
  /** Records an audit entry in the admin's name, with their IP. */
  audit: (entry: Omit<AuditEntry, "actor" | "ipAddress">) => Promise<void>;
};

export type AdminRouteResult = { data: unknown; status?: number };

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * Wraps an admin API route handler: Origin and content type, admin session (adminAccess),
 * rate limit for writes, body size and JSON parsing, error mapping, and `no-store` on every
 * response (some carry a client secret). The handler returns `{ data, status? }`, sent as
 * `{ data }`; errors from lib/errors become `{ error }` with their status.
 */
export function adminJsonRoute<P = Record<string, never>>(
  options: { body?: boolean },
  handler: (context: AdminRouteContext<P>) => Promise<AdminRouteResult>,
) {
  return async (request: Request, routeContext?: { params: Promise<P> }): Promise<NextResponse> => {
    try {
      if (!isAllowedOrigin(request, originOf(env.ADMIN_APP_URL))) return json({ error: "Cross-origin request refused" }, 403);
      if (options.body && !isJsonContentType(request)) return json({ error: "Content-Type must be application/json" }, 415);

      const authz = await requireAdminApiRequest();
      if (!authz.ok) return json({ error: authz.message }, authz.status);

      const ip = clientIp(authz.requestHeaders);
      if (!isSafeMethod(request.method)) await assertAdminWriteRateLimit(authz.actor.id, ip);

      let body: unknown;
      if (options.body) {
        assertRequestBodyWithinLimit(request);
        try {
          body = await request.json();
        } catch {
          throw new ValidationError("Invalid JSON body");
        }
      }

      const params = (routeContext ? await routeContext.params : {}) as P;
      const result = await handler({
        request,
        params,
        actor: authz.actor,
        requestHeaders: authz.requestHeaders,
        body,
        audit: (entry) => recordAudit({ ...entry, actor: authz.actor, ipAddress: ip }),
      });
      return json({ data: result.data }, result.status ?? 200);
    } catch (error) {
      const { message, statusCode } = handleError(error);
      if (statusCode >= 500) console.error("[admin api]", error);
      return json({ error: message }, statusCode);
    }
  };
}

/** A required, non-blank route parameter. */
export function requiredParam(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new ValidationError(`Missing ${name}`);
  return value;
}
