import { createPrivateKey, sign } from "node:crypto";

import { SOCIAL_PROVIDER_META, type SocialProvider } from "@ostiary/core/lib/social-provider-meta";

/*
 * Server only, no database: turns a provider's stored fields into Better Auth options.
 * Kept apart from social-providers.ts so it can be tested without a database.
 */

/** A provider's fields, secret and not, by key (as listed in SOCIAL_PROVIDER_META). */
export type ProviderValues = Record<string, string | undefined>;

/** Keys of a provider's fields (and the optional button name), never anything else. */
export function providerFieldKeys(id: SocialProvider): { plain: string[]; secret: string[] } {
  const fields = SOCIAL_PROVIDER_META[id].fields;
  return {
    plain: ["buttonName", ...fields.filter((f) => !f.secret).map((f) => f.key)],
    secret: fields.filter((f) => f.secret).map((f) => f.key),
  };
}

/** Required fields without a value. */
export function missingProviderFields(id: SocialProvider, values: ProviderValues): string[] {
  return SOCIAL_PROVIDER_META[id].fields
    .filter((field) => !field.optional && !field.options && !values[field.key]?.trim())
    .map((field) => field.key);
}

/** A problem with a field's value, or null. Checked when an admin saves. */
export function invalidProviderField(id: SocialProvider, values: ProviderValues): string | null {
  for (const field of SOCIAL_PROVIDER_META[id].fields) {
    const value = values[field.key]?.trim();
    if (!value) continue;
    if (field.options && !field.options.includes(value)) return `${field.label}: choose ${field.options.join(" or ")}.`;
  }
  if (id === "apple" && values.privateKey?.trim()) {
    try {
      const key = createPrivateKey(values.privateKey.trim());
      if (key.asymmetricKeyType !== "ec") return "Private key: expected the EC (P-256) key downloaded from Apple (.p8).";
    } catch {
      return "Private key: not a valid PEM private key. Paste the whole .p8 file, BEGIN and END lines included.";
    }
  }
  if ((id === "gitlab" || id === "paybin") && values.issuer?.trim()) {
    if (!isHttpsUrl(values.issuer.trim())) return "The URL must start with https://.";
  }
  if (id === "salesforce" && values.loginUrl?.trim() && !/^[a-z0-9.-]+$/i.test(stripScheme(values.loginUrl.trim()))) {
    return "My Domain: a host name such as example.my.salesforce.com.";
  }
  if (id === "cognito" && values.region?.trim() && !/^[a-z]{2}(-[a-z]+)+-\d$/.test(values.region.trim())) {
    return "Region: an AWS region such as eu-west-1.";
  }
  if (id === "google" && values.hd?.trim() && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(values.hd.trim())) {
    return "Workspace domain: a domain such as example.com.";
  }
  return null;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function stripScheme(value: string): string {
  return value.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
}

/** Apple's client secret: an ES256 JWT signed with the Sign in with Apple key (at most 6 months). */
export function appleClientSecret(
  { teamId, keyId, privateKey, clientId }: { teamId: string; keyId: string; privateKey: string; clientId: string },
  now = Date.now(),
): string {
  const iat = Math.floor(now / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const input = `${encode({ alg: "ES256", kid: keyId })}.${encode({
    iss: teamId,
    iat,
    // Regenerated whenever the settings are reloaded, so a short lifetime is enough.
    exp: iat + 7 * 24 * 3600,
    aud: "https://appleid.apple.com",
    sub: clientId,
  })}`;
  const signature = sign("sha256", Buffer.from(input), { key: createPrivateKey(privateKey), dsaEncoding: "ieee-p1363" });
  return `${input}.${signature.toString("base64url")}`;
}

/**
 * Better Auth options for one provider (`socialProviders[id]`), from its fields. Throws when a
 * required field is missing or a value cannot be used.
 */
export function buildProviderOptions(
  id: SocialProvider,
  values: ProviderValues,
  { allowSignUp = true }: { allowSignUp?: boolean } = {},
): Record<string, unknown> {
  const missing = missingProviderFields(id, values);
  if (missing.length) throw new Error(`${id}: missing ${missing.join(", ")}`);
  const v = (key: string) => values[key]?.trim() || undefined;
  const options: Record<string, unknown> = {};
  for (const field of SOCIAL_PROVIDER_META[id].fields) {
    const value = v(field.key) ?? field.options?.[0];
    if (value !== undefined) options[field.key] = value;
  }
  if (!allowSignUp) options.disableImplicitSignUp = true;

  switch (id) {
    case "apple": {
      // Apple's key fields only serve to sign the client secret; they are not Better Auth options.
      delete options.teamId;
      delete options.keyId;
      delete options.privateKey;
      options.clientSecret = appleClientSecret({
        teamId: v("teamId")!,
        keyId: v("keyId")!,
        privateKey: v("privateKey")!,
        clientId: v("clientId")!,
      });
      return options;
    }
    case "cognito":
      // The app client authenticates with its secret only when it has one.
      return { ...options, domain: stripScheme(v("domain")!), requireClientSecret: Boolean(v("clientSecret")) };
    case "gitlab":
    case "paybin":
      return v("issuer") ? { ...options, issuer: v("issuer")!.replace(/\/+$/, "") } : options;
    case "salesforce":
      return v("loginUrl") ? { ...options, loginUrl: stripScheme(v("loginUrl")!) } : options;
    default:
      return options;
  }
}
