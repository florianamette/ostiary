import { lookup as dnsLookup } from "node:dns/promises";
import { classifyHost, isLoopbackHost } from "@better-auth/core/utils/host";

/*
 * Webhook URLs are typed by an admin, but the server is the one connecting to them: a URL
 * pointing at 169.254.169.254, the database or another internal service would turn webhooks
 * into a way to reach the private network (SSRF). So an endpoint must be HTTPS and every
 * address its host resolves to must be public. The check runs when the endpoint is saved and
 * again before each delivery, whose connection is pinned to the addresses that were checked
 * (see transport.ts), so a DNS answer that changes in between (rebinding) cannot slip through.
 *
 * For local development only, WEBHOOKS_ALLOW_LOCALHOST=true also accepts http:// and loopback
 * addresses (localhost, 127.0.0.0/8, ::1). Private ranges stay refused even then.
 */

export type ResolvedAddress = { address: string; family: number };
export type Lookup = (hostname: string) => Promise<ResolvedAddress[]>;

export type UrlCheck =
  | { ok: true; url: URL; addresses: ResolvedAddress[] }
  | { ok: false; error: string };

export const MAX_WEBHOOK_URL_LENGTH = 2048;

const defaultLookup: Lookup = (hostname) => dnsLookup(hostname, { all: true, verbatim: true });

/** Checks the URL's form only (no DNS): what the admin form can tell at once. */
export function parseWebhookUrl(raw: string, allowLocalhost: boolean): { ok: true; url: URL } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed.length > MAX_WEBHOOK_URL_LENGTH) return { ok: false, error: "The URL is too long." };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "Enter an absolute URL, e.g. https://app.example.com/webhooks." };
  }
  if (url.username || url.password) return { ok: false, error: "The URL must not contain a user name or password." };
  if (url.hash) return { ok: false, error: "The URL must not contain a fragment (#)." };
  const loopback = isLoopbackHost(url.hostname);
  if (url.protocol === "http:") {
    if (!(allowLocalhost && loopback)) return { ok: false, error: "The URL must use https://." };
  } else if (url.protocol !== "https:") {
    return { ok: false, error: "The URL must use https://." };
  }
  if (loopback && !allowLocalhost) return { ok: false, error: "The URL points to this machine (localhost)." };
  const kind = classifyHost(url.hostname).kind;
  if (kind !== "public" && !(allowLocalhost && loopback)) {
    return { ok: false, error: `The URL points to a ${describeKind(kind)} address.` };
  }
  return { ok: true, url };
}

/** Whether a resolved address may be connected to. */
export function addressAllowed(address: string, allowLocalhost: boolean): boolean {
  const kind = classifyHost(address).kind;
  return kind === "public" || (allowLocalhost && kind === "loopback");
}

/**
 * Checks the URL and resolves its host. Every address must be allowed (one private answer
 * among public ones is enough to refuse); the connection may then use only these addresses.
 */
export async function checkWebhookUrl(raw: string, allowLocalhost: boolean, lookup: Lookup = defaultLookup): Promise<UrlCheck> {
  const parsed = parseWebhookUrl(raw, allowLocalhost);
  if (!parsed.ok) return parsed;
  const hostname = parsed.url.hostname.replace(/^\[|\]$/g, "");
  let addresses: ResolvedAddress[];
  try {
    addresses = await lookup(hostname);
  } catch {
    return { ok: false, error: `The host ${parsed.url.hostname} could not be resolved.` };
  }
  if (addresses.length === 0) return { ok: false, error: `The host ${parsed.url.hostname} has no address.` };
  const refused = addresses.find((a) => !addressAllowed(a.address, allowLocalhost));
  if (refused) {
    return {
      ok: false,
      error: `The host ${parsed.url.hostname} resolves to a ${describeKind(classifyHost(refused.address).kind)} address (${refused.address}).`,
    };
  }
  return { ok: true, url: parsed.url, addresses };
}

function describeKind(kind: string): string {
  switch (kind) {
    case "loopback":
    case "localhost":
      return "loopback";
    case "private":
      return "private";
    case "linkLocal":
      return "link-local";
    case "cloudMetadata":
      return "cloud metadata";
    case "sharedAddressSpace":
      return "shared (carrier-grade NAT)";
    default:
      return "non-public";
  }
}
