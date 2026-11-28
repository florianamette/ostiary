import { APIError } from "better-auth/api";

import { readAppSetting, writeAppSetting } from "@ostiary/core/lib/app-settings";
import { countrySourceConfigured, requestCountry } from "@ostiary/core/lib/country";
import { countryAllowed, DEFAULT_COUNTRY_POLICY, parseCountryPolicy, type CountryPolicy } from "@ostiary/core/lib/country-policy-options";
import { refreshingCache } from "@ostiary/core/lib/refreshing-cache";

/*
 * Which countries may sign in and sign up (admin console, Security). Checked when a session
 * starts, whatever the sign-in method, and when an account is created: auth-hooks/
 * database-hooks.ts. Platform admins are never refused, so the console stays reachable. A
 * request whose country is unknown is allowed; without a country source (country.ts) the policy
 * is not applied at all.
 */

export {
  COUNTRY_MODES,
  DEFAULT_COUNTRY_POLICY,
  MAX_COUNTRIES,
  normalizeCountryList,
  parseCountryPolicy,
  type CountryMode,
  type CountryPolicy,
} from "@ostiary/core/lib/country-policy-options";

const SETTINGS_KEY = "country_policy";

/** Error code of a refused sign-in or sign-up (translated in the auth app). */
export const COUNTRY_NOT_ALLOWED = "COUNTRY_NOT_ALLOWED";

export async function loadCountryPolicy(): Promise<CountryPolicy> {
  return parseCountryPolicy(await readAppSetting(SETTINGS_KEY));
}

/** Each instance reloads it at most once a minute. */
const policyCache = refreshingCache({
  globalKey: "__ostiaryCountryPolicy",
  refreshMs: 60_000,
  initial: DEFAULT_COUNTRY_POLICY,
  load: loadCountryPolicy,
  loadError: "Could not load the country policy",
});

export async function saveCountryPolicy(policy: CountryPolicy, updatedBy: string | null): Promise<CountryPolicy> {
  const saved = parseCountryPolicy(policy);
  await writeAppSetting(SETTINGS_KEY, saved, updatedBy);
  policyCache.invalidate();
  return saved;
}

/** The request's country when the policy refuses it, else null. */
export async function refusedCountry(headers: Headers | null | undefined): Promise<string | null> {
  if (!headers || !countrySourceConfigured()) return null;
  const policy = await policyCache.get();
  if (policy.mode === "any") return null;
  const country = await requestCountry(headers);
  return countryAllowed(country, policy) ? null : country;
}

/**
 * The refusal the auth app translates. A 400, not a 403: Better Auth answers a 403 during
 * sign-up as for a taken address, saying nothing, and the sign-in form reads a 403 as an
 * unverified address.
 */
export function countryRefusal(): APIError {
  return new APIError("BAD_REQUEST", {
    message: "Signing in from this country is not allowed here.",
    code: COUNTRY_NOT_ALLOWED,
  });
}
