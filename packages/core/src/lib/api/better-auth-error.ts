/*
 * Errors from Better Auth calls made on the server (`auth.api.*`). Its APIError carries an
 * HTTP status and, in its body, a message meant for the caller (`message`, or for OAuth
 * endpoints `error_description`). Anything else that escapes such a call, a database error
 * above all, has internals in its `message` ("Failed query: ..."), which must not reach the
 * admin's screen.
 */

/** The HTTP status of an error from a Better Auth call, if it has one. */
export function betterAuthErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const { statusCode, status } = error as { statusCode?: unknown; status?: unknown };
  if (typeof statusCode === "number") return statusCode;
  if (typeof status === "number") return status;
  return undefined;
}

/**
 * The message to show for an error from a Better Auth call: the one in its body for a client
 * error (4xx), else `fallback`. Never the error's own `message`, never a server error's.
 */
export function betterAuthErrorMessage(error: unknown, fallback: string): string {
  const status = betterAuthErrorStatus(error);
  if (status === undefined || status >= 500) return fallback;
  const body = (error as { body?: unknown }).body;
  if (body && typeof body === "object") {
    const { error_description: description, message } = body as Record<string, unknown>;
    if (typeof description === "string" && description.trim()) return description;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}
