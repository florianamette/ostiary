/**
 * Where to send someone after sign-in when the destination comes from the request
 * (`callbackURL`, a resume path): only a page of this app or of another trusted app.
 *
 * WHATWG URL parsing is lenient in ways a "starts with / but not //" check misses: it turns
 * `\` into `/` (`/\evil.com` is `//evil.com`, another host) and drops tabs and newlines
 * (`/\t/evil.com`). So the raw value is refused when it holds a backslash, a control
 * character or surrounding whitespace, and what the browser would actually load is resolved
 * and its origin compared. Same idea as Better Auth's own callbackURL check.
 */

/** C0 controls (tab, CR, LF included), DEL, C1 controls, and the backslash. */
const UNSAFE_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\\]/;

/** Base used to resolve relative paths when the current origin is unknown. Never returned. */
const PLACEHOLDER_ORIGIN = "https://ostiary.invalid";

export type SafeRedirectOptions = {
  /** The current app's origin; relative paths resolve against it. */
  origin?: string | null;
  /** Other origins that absolute URLs may point to (e.g. the admin app). */
  allowedOrigins?: readonly (string | null | undefined)[];
};

function originOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * The destination as a URL when it is safe to follow, otherwise null. A relative value must be
 * a path (`/…`, not `//…`) that stays on `origin`; an absolute one must be http(s) on `origin`
 * or one of `allowedOrigins`, without credentials.
 */
export function resolveSafeRedirect(raw: string | null | undefined, options: SafeRedirectOptions = {}): URL | null {
  if (!raw || raw !== raw.trim() || UNSAFE_CHARACTERS.test(raw)) return null;

  const own = originOf(options.origin);
  if (raw.startsWith("/")) {
    if (raw.startsWith("//")) return null;
    const base = own ?? PLACEHOLDER_ORIGIN;
    let url: URL;
    try {
      url = new URL(raw, base);
    } catch {
      return null;
    }
    return url.origin === base ? url : null;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  const allowed = new Set(
    [own, ...(options.allowedOrigins ?? []).map(originOf)].filter((o): o is string => Boolean(o)),
  );
  return allowed.has(url.origin) ? url : null;
}

/**
 * `raw` when it is safe to follow (see {@link resolveSafeRedirect}), otherwise `fallback`. A
 * path on the current origin comes back as a path, anything else as an absolute URL.
 */
export function safeRedirectTarget(
  raw: string | null | undefined,
  fallback: string,
  options: SafeRedirectOptions = {},
): string {
  const url = resolveSafeRedirect(raw, options);
  if (!url) return fallback;
  const own = originOf(options.origin);
  const relative = raw!.startsWith("/") || url.origin === own;
  return relative ? `${url.pathname}${url.search}${url.hash}` : url.href;
}
