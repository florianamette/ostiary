/*
 * Checks for route handlers that change things with the caller's cookies. Server actions get an
 * Origin check from Next.js; route handlers do not, so they call these.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Whether a method only reads (no Origin check, no rate limit for writes). */
export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase());
}

/**
 * Whether a request may act with the caller's cookies: reads always, writes only with an
 * `Origin` header equal to `allowedOrigin`. Browsers send Origin on every cross-origin request
 * and on same-origin writes, so a missing one is refused too.
 */
export function isAllowedOrigin(request: Request, allowedOrigin: string | null): boolean {
  if (isSafeMethod(request.method)) return true;
  const origin = request.headers.get("origin");
  return Boolean(allowedOrigin && origin && origin === allowedOrigin);
}

/**
 * Whether a request's body is declared as JSON (`application/json`, any parameters). A form or
 * a `text/plain` body is what another site can send without a CORS preflight.
 */
export function isJsonContentType(request: Request): boolean {
  const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  return type === "application/json";
}

/** Whether a request's body is declared as `multipart/form-data` (an upload). */
export function isMultipartContentType(request: Request): boolean {
  const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  return type === "multipart/form-data";
}

/** The origin of a configured URL (ADMIN_APP_URL...), or null when it is missing or unreadable. */
export function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Whether an error is Postgres refusing a duplicate (unique_violation, 23505), on a constraint
 * whose name contains `constraintHint` when the driver says which. Drizzle and Better Auth may
 * wrap the driver's error, so its `cause` chain is checked too.
 */
export function isUniqueViolation(error: unknown, constraintHint: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const { code, constraint } = current as { code?: unknown; constraint?: unknown };
    if (code === "23505" && (typeof constraint !== "string" || constraint.includes(constraintHint))) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
