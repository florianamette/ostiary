import { PayloadTooLargeError } from "@ostiary/core/lib/errors";

const DEFAULT_MAX_JSON_BODY_BYTES = 1024 * 1024;

/**
 * Rejects oversized bodies before buffering full JSON (Content-Length check).
 * Call before `request.json()` in route handlers.
 */
export function assertRequestBodyWithinLimit(
  request: Request,
  maxBytes: number = DEFAULT_MAX_JSON_BODY_BYTES,
): void {
  const raw = request.headers.get("content-length");
  if (!raw) return;
  const n = Number.parseInt(raw, 10);
  if (Number.isFinite(n) && n > maxBytes) {
    throw new PayloadTooLargeError();
  }
}
