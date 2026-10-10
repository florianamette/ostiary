import { getPinned, type GetResult } from "@ostiary/core/lib/webhooks/transport";
import { checkWebhookUrl, type Lookup, type ResolvedAddress, type UrlRefusal } from "@ostiary/core/lib/webhooks/url-safety";
import { MAX_SAML_METADATA_BYTES, type SamlError } from "@ostiary/core/lib/saml";

/*
 * Server-side GET of an identity provider's metadata URL, typed by an admin. Same guard as
 * webhook deliveries and app icons (url-safety.ts): https only, every address the host
 * resolves to must be public, the connection is pinned to those addresses, redirects are
 * followed by hand (at most two, each re-checked), 10 s and 100 KB at most.
 * WEBHOOKS_ALLOW_LOCALHOST=true (development only) also accepts http://localhost, to test
 * against a local IdP.
 */

const METADATA_FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 2;

export type MetadataFetchOptions = {
  allowLocalhost?: boolean;
  lookup?: Lookup;
  get?: (url: URL, addresses: ResolvedAddress[], headers: Record<string, string>, options: { maxBytes: number; timeoutMs: number }) => Promise<GetResult>;
};

/** A refused metadata URL: `urlCode` (with `values`) is url-safety's code, for translated messages. */
export type MetadataUrlRefusal = { ok: false; error: string; code?: undefined; urlCode: UrlRefusal["code"]; values?: Record<string, string> };

export async function fetchSamlMetadata(raw: string, options: MetadataFetchOptions = {}): Promise<{ ok: true; xml: string } | SamlError | MetadataUrlRefusal> {
  const get = options.get ?? getPinned;
  let current = raw.trim();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = await checkWebhookUrl(current, options.allowLocalhost ?? false, options.lookup);
    if (!check.ok) return { ok: false, error: check.error, urlCode: check.code, values: check.values };
    const result = await get(
      check.url,
      check.addresses,
      { accept: "application/samlmetadata+xml, application/xml, text/xml;q=0.9, */*;q=0.1", "user-agent": "Ostiary-SAML-Metadata/1.0" },
      { maxBytes: MAX_SAML_METADATA_BYTES, timeoutMs: METADATA_FETCH_TIMEOUT_MS },
    );
    if (!result.ok) return { ok: false, error: `Could not fetch the metadata: ${result.error}`, code: "fetchFailed", values: { reason: result.error } };
    const location = result.headers.location;
    if (result.status >= 300 && result.status < 400 && location) {
      try {
        current = new URL(location, check.url).href;
      } catch {
        return { ok: false, error: "The metadata URL redirects to an invalid address.", code: "invalidRedirect" };
      }
      continue;
    }
    if (result.status !== 200) return { ok: false, error: `The metadata URL answered ${result.status}.`, code: "httpStatus", values: { status: String(result.status) } };
    if (result.truncated) return { ok: false, error: "The metadata is larger than 100 KB.", code: "metadataTooLarge" };
    return { ok: true, xml: result.body.toString("utf8") };
  }
  return { ok: false, error: "The metadata URL redirects too many times.", code: "tooManyRedirects" };
}
