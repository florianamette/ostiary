"use server";

import { z } from "zod";

import {
  loadAuthPolicy,
  MIN_PASSWORD_LENGTHS,
  saveAuthPolicy,
  SESSION_DAYS,
  TWO_FACTOR_GRACE_DAYS,
  type AuthPolicy,
} from "@ostiary/core/lib/auth-policy";
import {
  EMAIL_DOMAIN_MODES,
  loadEmailDomainPolicy,
  MAX_EMAIL_DOMAINS,
  normalizeDomainList,
  saveEmailDomainPolicy,
  type EmailDomainPolicy,
} from "@ostiary/core/lib/email-domain-policy";

import {
  COUNTRY_MODES,
  loadCountryPolicy,
  MAX_COUNTRIES,
  normalizeCountryList,
  saveCountryPolicy,
  type CountryPolicy,
} from "@ostiary/core/lib/country-policy";

import { adminAction } from "@/lib/admin-action";

const policySchema = z
  .object({
    sessionDays: z.number().refine((v) => (SESSION_DAYS as readonly number[]).includes(v)),
    extendSessions: z.boolean(),
    signOutOnPasswordChange: z.boolean(),
    minPasswordLength: z.number().refine((v) => (MIN_PASSWORD_LENGTHS as readonly number[]).includes(v)),
    passwordSignUp: z.boolean(),
    twoFactorEveryone: z.boolean(),
    twoFactorGraceDays: z.number().refine((v) => (TWO_FACTOR_GRACE_DAYS as readonly number[]).includes(v)),
    newDeviceEmail: z.boolean(),
  })
  .strict();

type Result = { ok: true } | { ok: false; error: "invalid" | "save" };

/** Saves the session and password policy. The auth app applies it within a minute. */
export async function updateAuthPolicy(input: Omit<AuthPolicy, "twoFactorRequiredSince">): Promise<Result> {
  return adminAction(
    z.tuple([policySchema]),
    [input],
    async ([policy], { session, audit }): Promise<Result> => {
      let previous: AuthPolicy;
      let saved: AuthPolicy;
      try {
        previous = await loadAuthPolicy();
        saved = await saveAuthPolicy(policy, session.user.id, previous);
      } catch (error) {
        console.error("Could not save the session and password policy", error);
        return { ok: false, error: "save" };
      }
      await audit({ action: "security.update_policy", metadata: { ...saved, previous } });
      return { ok: true };
    },
    (): Result => ({ ok: false, error: "invalid" }),
  );
}

const domainPolicySchema = z
  .object({
    mode: z.enum(EMAIL_DOMAIN_MODES),
    domains: z.array(z.string().max(300)).max(MAX_EMAIL_DOMAINS),
    blockDisposable: z.boolean(),
  })
  .strict();

type DomainResult = { ok: true } | { ok: false; error: "invalid" | "invalidDomain" | "noDomains" | "save" };

/** Saves which email domains may create an account. The auth app applies it within a minute. */
export async function updateEmailDomainPolicy(input: EmailDomainPolicy): Promise<DomainResult> {
  return adminAction(
    z.tuple([domainPolicySchema]),
    [input],
    async ([raw], { session, audit }): Promise<DomainResult> => {
      const domains = normalizeDomainList(raw.domains);
      if (!domains) return { ok: false, error: "invalidDomain" };
      if (raw.mode === "allow" && domains.length === 0) return { ok: false, error: "noDomains" };
      let previous: EmailDomainPolicy;
      let saved: EmailDomainPolicy;
      try {
        previous = await loadEmailDomainPolicy();
        // "Only these domains" decides on its own: the throwaway list does not apply.
        saved = await saveEmailDomainPolicy({ ...raw, domains, blockDisposable: raw.mode !== "allow" && raw.blockDisposable }, session.user.id);
      } catch (error) {
        console.error("Could not save the email domain policy", error);
        return { ok: false, error: "save" };
      }
      await audit({ action: "security.update_email_domains", metadata: { ...saved, previous } });
      return { ok: true };
    },
    (): DomainResult => ({ ok: false, error: "invalid" }),
  );
}

const countryPolicySchema = z
  .object({
    mode: z.enum(COUNTRY_MODES),
    countries: z.array(z.string().max(10)).max(MAX_COUNTRIES),
  })
  .strict();

type CountryResult = { ok: true } | { ok: false; error: "invalid" | "invalidCountry" | "noCountries" | "save" };

/** Saves which countries may sign in and sign up. The auth app applies it within a minute. */
export async function updateCountryPolicy(input: CountryPolicy): Promise<CountryResult> {
  return adminAction(
    z.tuple([countryPolicySchema]),
    [input],
    async ([raw], { session, audit }): Promise<CountryResult> => {
      const countries = normalizeCountryList(raw.countries);
      if (!countries) return { ok: false, error: "invalidCountry" };
      if (raw.mode !== "any" && countries.length === 0) return { ok: false, error: "noCountries" };
      let previous: CountryPolicy;
      let saved: CountryPolicy;
      try {
        previous = await loadCountryPolicy();
        saved = await saveCountryPolicy({ mode: raw.mode, countries: raw.mode === "any" ? [] : countries }, session.user.id);
      } catch (error) {
        console.error("Could not save the country policy", error);
        return { ok: false, error: "save" };
      }
      await audit({ action: "security.update_countries", metadata: { ...saved, previous } });
      return { ok: true };
    },
    (): CountryResult => ({ ok: false, error: "invalid" }),
  );
}
