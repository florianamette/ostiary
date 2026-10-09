import { getPinned, type GetResult } from "@ostiary/core/lib/webhooks/transport";
import { checkWebhookUrl, type Lookup, type ResolvedAddress } from "@ostiary/core/lib/webhooks/url-safety";

/*
 * Server-side GET of a URL chosen by an app's registration (its logo, its site), which for a
 * self-registered app is chosen by anyone. Same guard as webhook deliveries (url-safety.ts):
 * https only, on port 443, every address the host resolves to must be public, and the
 * connection is pinned to those checked addresses. Redirects are followed by hand, at most
 * twice, and each target goes through the same checks.
 */

export const ICON_FETCH_TIMEOUT_MS = 3_000;
export const MAX_REDIRECTS = 2;
const USER_AGENT = "Mozilla/5.0 (compatible; OstiaryIconFetcher/1.0; +https://github.com/florianamette/ostiary)";

export type SafeResponse = { url: string; status: number; contentType: string; body: Buffer };
export type SafeFetchResult = { ok: true; response: SafeResponse } | { ok: false; error: string };

export type SafeGetOptions = {
  maxBytes: number;
  accept: string;
  timeoutMs?: number;
  /** Keep the first `maxBytes` of a longer answer (HTML: the icons are in the head) instead of failing. */
  allowTruncated?: boolean;
  /** For tests: DNS and the pinned GET. */
  lookup?: Lookup;
  get?: (url: URL, addresses: ResolvedAddress[], headers: Record<string, string>, options: { maxBytes: number; timeoutMs: number }) => Promise<GetResult>;
};

export type SafeFetcher = (url: string, options: SafeGetOptions) => Promise<SafeFetchResult>;

export const safeGet: SafeFetcher = async (raw, options) => {
  const timeoutMs = options.timeoutMs ?? ICON_FETCH_TIMEOUT_MS;
  const get = options.get ?? getPinned;
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = await checkWebhookUrl(current, false, options.lookup);
    if (!check.ok) return { ok: false, error: check.error };
    if (check.url.port !== "") return { ok: false, error: "Only the default https port is fetched." };
    const result = await get(
      check.url,
      check.addresses,
      { accept: options.accept, "user-agent": USER_AGENT },
      { maxBytes: options.maxBytes, timeoutMs },
    );
    if (!result.ok) return { ok: false, error: result.error };
    const location = result.headers.location;
    if (result.status >= 300 && result.status < 400 && location) {
      try {
        current = new URL(location, check.url).href;
      } catch {
        return { ok: false, error: "Invalid redirect." };
      }
      continue;
    }
    if (result.truncated && !options.allowTruncated) return { ok: false, error: `Larger than ${options.maxBytes} bytes.` };
    return {
      ok: true,
      response: { url: check.url.href, status: result.status, contentType: result.headers["content-type"] ?? "", body: result.body },
    };
  }
  return { ok: false, error: "Too many redirects." };
};
