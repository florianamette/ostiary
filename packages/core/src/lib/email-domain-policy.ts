import { APIError } from "better-auth/api";

import { readAppSetting, writeAppSetting } from "@ostiary/core/lib/app-settings";
import { refreshingCache } from "@ostiary/core/lib/refreshing-cache";
import {
  DEFAULT_EMAIL_DOMAIN_POLICY,
  emailDomainAllowed,
  parseEmailDomainPolicy,
  type EmailDomainPolicy,
} from "@ostiary/core/lib/email-domain-policy-options";

/*
 * Which email domains may create an account (admin console, Security). Checked when an account
 * is created, whatever the method (password, social, custom providers, One Tap, text code), and
 * when someone changes their address: auth-hooks/database-hooks.ts and request-guards.ts.
 * Accounts an admin creates, and those an organization's SSO or SCIM provisions, are not
 * checked: the admin chose them. Existing accounts keep working.
 */

export {
  DEFAULT_EMAIL_DOMAIN_POLICY,
  EMAIL_DOMAIN_MODES,
  MAX_EMAIL_DOMAINS,
  normalizeDomainList,
  parseEmailDomainPolicy,
  type EmailDomainMode,
  type EmailDomainPolicy,
} from "@ostiary/core/lib/email-domain-policy-options";

const SETTINGS_KEY = "email_domain_policy";

/** Error code of a refused address (translated in the auth app). */
export const EMAIL_DOMAIN_NOT_ALLOWED = "EMAIL_DOMAIN_NOT_ALLOWED";

export async function loadEmailDomainPolicy(): Promise<EmailDomainPolicy> {
  return parseEmailDomainPolicy(await readAppSetting(SETTINGS_KEY));
}

/** Each instance reloads it at most once a minute. */
const policyCache = refreshingCache({
  globalKey: "__ostiaryEmailDomainPolicy",
  refreshMs: 60_000,
  initial: DEFAULT_EMAIL_DOMAIN_POLICY,
  load: loadEmailDomainPolicy,
  loadError: "Could not load the email domain policy",
});

export function currentEmailDomainPolicy(): Promise<EmailDomainPolicy> {
  return policyCache.get();
}

export async function saveEmailDomainPolicy(policy: EmailDomainPolicy, updatedBy: string | null): Promise<EmailDomainPolicy> {
  const saved = parseEmailDomainPolicy(policy);
  await writeAppSetting(SETTINGS_KEY, saved, updatedBy);
  policyCache.invalidate();
  return saved;
}

let disposableDomains: Promise<ReadonlySet<string>> | undefined;

/** The bundled throwaway-email list (about 9,000 domains), loaded the first time it is needed. */
function disposableSet(): Promise<ReadonlySet<string>> {
  disposableDomains ??= import("disposable-email-domains-js").then((m) => m.disposableEmailBlocklistSet());
  return disposableDomains;
}

/** Whether the policy lets this address be used for a new account or as a new address. */
export async function emailAllowedByPolicy(email: string, policy?: EmailDomainPolicy): Promise<boolean> {
  const current = policy ?? (await currentEmailDomainPolicy());
  return emailDomainAllowed(email, current, current.blockDisposable ? await disposableSet() : undefined);
}

/** Throws the refusal the auth app translates. */
export async function assertEmailDomainAllowed(email: string): Promise<void> {
  if (await emailAllowedByPolicy(email)) return;
  throw new APIError("BAD_REQUEST", {
    message: "Accounts with this email domain are not allowed here.",
    code: EMAIL_DOMAIN_NOT_ALLOWED,
  });
}
