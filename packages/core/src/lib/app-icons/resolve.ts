import { findIconLinks } from "@ostiary/core/lib/app-icons/html";
import { isImageContentType, sniffImageType, type IconType } from "@ostiary/core/lib/app-icons/image";
import { safeGet, type SafeFetcher } from "@ostiary/core/lib/app-icons/fetch";
import type { IconSource } from "@ostiary/core/lib/app-icons/site";

export const MAX_HTML_BYTES = 512 * 1024;
export const MAX_ICON_BYTES = 256 * 1024;
/** Whole lookup budget for one app: the home page plus a few icon tries. */
export const RESOLVE_BUDGET_MS = 8_000;
/** Icon links tried from the page before /favicon.ico. */
const MAX_CANDIDATES = 3;

export type ResolvedIcon = { contentType: IconType; data: Buffer };
export type ResolveResult = { ok: true; icon: ResolvedIcon } | { ok: false; error: string };

type Deps = { fetch?: SafeFetcher; now?: () => number };

function toHttps(raw: string): string {
  const url = new URL(raw);
  if (url.protocol === "http:") {
    url.protocol = "https:";
    if (url.port === "80") url.port = "";
  }
  return url.href;
}

async function fetchIcon(url: string, fetch: SafeFetcher, timeoutMs: number): Promise<ResolveResult> {
  const result = await fetch(url, {
    maxBytes: MAX_ICON_BYTES,
    accept: "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8",
    timeoutMs,
  });
  if (!result.ok) return result;
  const { status, contentType, body } = result.response;
  if (status !== 200) return { ok: false, error: `HTTP ${status}` };
  if (!isImageContentType(contentType)) return { ok: false, error: `Not an image (${contentType || "no type"}).` };
  const type = sniffImageType(body);
  if (!type) return { ok: false, error: "Unrecognized image data." };
  return { ok: true, icon: { contentType: type, data: body } };
}

/**
 * Finds the icon for a source: the registered logo as is, or for a site the best icon its
 * home page links to (SVG, apple-touch-icon or the largest `sizes`), then `/favicon.ico`.
 * The web app manifest is not read: it costs one more request for icons that the page
 * almost always links as well.
 */
export async function resolveAppIcon(source: IconSource, deps: Deps = {}): Promise<ResolveResult> {
  const fetch = deps.fetch ?? safeGet;
  const now = deps.now ?? Date.now;
  const deadline = now() + RESOLVE_BUDGET_MS;
  const remaining = () => Math.min(3_000, deadline - now());

  if (source.kind === "logo") return fetchIcon(source.url, fetch, remaining());

  const tried = new Set<string>();
  const candidates: string[] = [];
  let lastError = "No icon found.";
  const page = await fetch(`${source.origin}/`, {
    maxBytes: MAX_HTML_BYTES,
    accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
    timeoutMs: remaining(),
    allowTruncated: true,
  });
  let pageOrigin = source.origin;
  if (page.ok) {
    const { status, contentType, body, url } = page.response;
    pageOrigin = new URL(url).origin;
    if (status === 200 && /html/i.test(contentType)) {
      for (const link of findIconLinks(body.toString("utf8"), url).slice(0, MAX_CANDIDATES)) candidates.push(link.url);
    } else {
      lastError = `Home page: HTTP ${status}`;
    }
  } else {
    lastError = `Home page: ${page.error}`;
  }
  candidates.push(`${pageOrigin}/favicon.ico`, `${source.origin}/favicon.ico`);

  for (const candidate of candidates) {
    let url: string;
    try {
      url = toHttps(candidate);
    } catch {
      continue;
    }
    if (tried.has(url)) continue;
    tried.add(url);
    if (remaining() <= 200) return { ok: false, error: "Took too long." };
    const result = await fetchIcon(url, fetch, remaining());
    if (result.ok) return result;
    lastError = `${url}: ${result.error}`;
  }
  return { ok: false, error: lastError };
}
