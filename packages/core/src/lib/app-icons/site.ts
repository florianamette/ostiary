import { classifyHost } from "@better-auth/core/utils/host";

/*
 * Which web site an OAuth application belongs to, from its registration alone (no network):
 * its `client_uri`, or else where it sends users back after sign-in. Used for the subtitle and
 * link of an app on the account dashboard, and as the place to look for its icon.
 */

export type AppSite = {
  /** Link to the app's site: its `client_uri`, or the origin of a redirect URI. */
  url: string;
  /** Host shown to users, e.g. `www.cyberlibrary.com`. */
  host: string;
  /** `https://` origin where the icon is looked up; null when the site is not on https port 443. */
  iconOrigin: string | null;
};

export type ClientSiteInfo = {
  uri?: string | null;
  icon?: string | null;
  redirectUris?: readonly string[] | null;
};

// Names that only make sense on a private network, even when DNS would answer.
const PRIVATE_SUFFIXES = [".local", ".localhost", ".internal", ".lan", ".home.arpa", ".test", ".invalid", ".example"];

/** A host a person could visit on the public web: a dotted public name or public IP. */
function isPublicWebHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (classifyHost(host).kind !== "public") return false;
  if (classifyHost(host).literal === "fqdn") {
    if (!host.includes(".")) return false;
    if (PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix))) return false;
  }
  return true;
}

function parseWebUrl(raw: string | null | undefined, protocols: readonly string[]): URL | null {
  if (!raw || raw.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!protocols.includes(url.protocol) || url.username || url.password) return null;
  return isPublicWebHost(url.hostname) ? url : null;
}

/** The https origin to fetch icons from, when the site is on the default port. */
function httpsOrigin(url: URL): string | null {
  const port = url.protocol === "https:" ? url.port : url.port === "" ? "" : "x";
  return port === "" ? `https://${url.hostname}` : null;
}

/**
 * The app's site: `client_uri` when it is a public http(s) URL, else the origin of the first
 * https redirect URI on a public host. Native and custom schemes (`com.example.app:/cb`),
 * localhost and private addresses are skipped.
 */
export function appSite(client: ClientSiteInfo): AppSite | null {
  const uri = parseWebUrl(client.uri, ["https:", "http:"]);
  if (uri) return { url: uri.href, host: uri.host, iconOrigin: httpsOrigin(uri) };
  for (const raw of client.redirectUris ?? []) {
    const redirect = parseWebUrl(raw, ["https:"]);
    if (redirect) return { url: `${redirect.origin}/`, host: redirect.host, iconOrigin: httpsOrigin(redirect) };
  }
  return null;
}

export type IconSource = { kind: "logo"; url: string } | { kind: "site"; origin: string };

/**
 * Where the app's icon comes from: its registered logo (`logo_uri`, https only), else its
 * site's home page. Doubles as the cache key (a logo URL always has a path, an origin never).
 */
export function appIconSource(client: ClientSiteInfo): IconSource | null {
  const logo = parseWebUrl(client.icon, ["https:"]);
  if (logo && logo.port === "") return { kind: "logo", url: logo.href };
  const origin = appSite(client)?.iconOrigin;
  return origin ? { kind: "site", origin } : null;
}

export function iconSourceKey(source: IconSource): string {
  return source.kind === "logo" ? source.url : source.origin;
}
