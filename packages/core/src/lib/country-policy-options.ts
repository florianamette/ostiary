/*
 * The country policy's choices, defaults and parsing: no database, so the admin console's client
 * components can import it. Loading, saving and checking: country-policy.ts.
 */

export const COUNTRY_MODES = ["any", "allow", "block"] as const;
export type CountryMode = (typeof COUNTRY_MODES)[number];
export const MAX_COUNTRIES = 250;

export type CountryPolicy = {
  /** Any country, only the listed ones, or all but the listed ones. */
  mode: CountryMode;
  /** ISO 3166-1 alpha-2 codes, upper case. */
  countries: string[];
};

export const DEFAULT_COUNTRY_POLICY: CountryPolicy = { mode: "any", countries: [] };

const regionNames = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });

/** A country (or territory) code that exists: "FR", "us". Not "EU", "XX" or "T1". */
export function isCountryCode(value: string): boolean {
  if (!/^[A-Za-z]{2}$/.test(value)) return false;
  const code = value.toUpperCase();
  // ISO's user-assigned codes (AA, QM-QZ, XA-XZ, ZZ: Cloudflare's XX and T1 among them) and
  // the EU and UN, which some sources use, are not countries.
  if (code === "AA" || code === "ZZ" || code === "EU" || code === "UN" || /^(Q[M-Z]|X[A-Z])$/.test(code)) return false;
  return regionNames.of(code) !== undefined;
}

/** Codes from the console, upper case, sorted, without duplicates; null if one is not a country. */
export function normalizeCountryList(raw: readonly string[]): string[] | null {
  const codes = new Set<string>();
  for (const entry of raw) {
    const value = entry.trim();
    if (!value) continue;
    if (!isCountryCode(value)) return null;
    codes.add(value.toUpperCase());
  }
  return [...codes].sort();
}

export function parseCountryPolicy(raw: unknown): CountryPolicy {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const mode = COUNTRY_MODES.includes(value.mode as CountryMode) ? (value.mode as CountryMode) : DEFAULT_COUNTRY_POLICY.mode;
  const countries = Array.isArray(value.countries)
    ? (normalizeCountryList(value.countries.filter((c): c is string => typeof c === "string")) ?? []).slice(0, MAX_COUNTRIES)
    : [];
  // "Only these countries" with none listed would lock everyone out: read as "any".
  if (mode === "allow" && countries.length === 0) return { mode: "any", countries };
  return { mode, countries };
}

/** Whether a request from this country may sign in or sign up. An unknown country may. */
export function countryAllowed(country: string | null, policy: CountryPolicy): boolean {
  if (policy.mode === "any" || !country) return true;
  const listed = policy.countries.includes(country.toUpperCase());
  return policy.mode === "allow" ? listed : !listed;
}

/** A country's name in the given language ("FR" in "fr": "France"), or the code itself. */
export function countryName(lang: string, code: string): string {
  try {
    return new Intl.DisplayNames([lang], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
