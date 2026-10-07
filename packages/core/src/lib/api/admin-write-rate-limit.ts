import { TooManyRequestsError } from "@ostiary/core/lib/errors";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 120;

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * In-memory sliding-window limiter for admin write routes.
 * Resets per process; use Redis/Upstash in multi-instance production.
 */
export function assertAdminWriteRateLimit(request: Request): void {
  if (process.env.NODE_ENV === "test") {
    return;
  }
  const key = clientKey(request);
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.windowStart >= WINDOW_MS) {
    b = { count: 0, windowStart: now };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count > MAX_REQUESTS_PER_WINDOW) {
    throw new TooManyRequestsError();
  }
}
