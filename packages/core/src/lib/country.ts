import type { CountryResponse, Reader } from "maxmind";

import { clientIp } from "@ostiary/core/lib/auth-events";
import { isCountryCode } from "@ostiary/core/lib/country-policy-options";
import { env } from "@ostiary/core/lib/env";

/*
 * The country a request comes from, for the country policy (country-policy.ts) and the
 * new-device email. From, in order:
 * - COUNTRY_HEADER: a header a trusted proxy sets (Cloudflare's cf-ipcountry). On Vercel,
 *   x-vercel-ip-country is used without it.
 * - GEOIP_DATABASE: a MaxMind GeoLite2 (or GeoIP2) Country database file, looked up with the
 *   client IP address (IP_ADDRESS_HEADERS, TRUSTED_PROXIES).
 * Neither: the country is unknown, and the policy cannot be turned on.
 */

function countryHeader(): string | null {
  const configured = env.COUNTRY_HEADER?.trim().toLowerCase();
  if (configured) return configured;
  return env.VERCEL ? "x-vercel-ip-country" : null;
}

/** Whether a country can be known at all (the admin console offers the policy only then). */
export function countrySourceConfigured(): boolean {
  return Boolean(countryHeader() || env.GEOIP_DATABASE?.trim());
}

let reader: Promise<Reader<CountryResponse> | null> | undefined;

function geoipReader(): Promise<Reader<CountryResponse> | null> {
  const file = env.GEOIP_DATABASE?.trim();
  if (!file) return Promise.resolve(null);
  reader ??= import("maxmind")
    .then((maxmind) => maxmind.open<CountryResponse>(file))
    .catch((error: unknown) => {
      console.error("[country] could not open GEOIP_DATABASE", error instanceof Error ? error.message : error);
      return null;
    });
  return reader;
}

/** The request's country (ISO 3166-1 alpha-2, upper case), or null when unknown. */
export async function requestCountry(headers: Headers | null | undefined): Promise<string | null> {
  if (!headers) return null;
  const header = countryHeader();
  if (header) {
    const value = headers.get(header)?.trim();
    // Cloudflare: XX unknown, T1 Tor.
    if (value && isCountryCode(value)) return value.toUpperCase();
  }
  const db = await geoipReader();
  const ip = db ? clientIp(headers) : null;
  if (!db || !ip) return null;
  try {
    const code = db.get(ip)?.country?.iso_code;
    return code && isCountryCode(code) ? code.toUpperCase() : null;
  } catch {
    return null;
  }
}
