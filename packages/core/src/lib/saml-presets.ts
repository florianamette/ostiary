/*
 * SAML values shared by the server and the admin console's browser code (no Node imports):
 * SP URLs and attribute-mapping presets. Validation lives in saml.ts.
 */

export const SAML_PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{1,62}$/;

/** Service-provider values the IdP admin copies into their identity provider. */
export type SamlServiceProviderUrls = { acsUrl: string; entityId: string; metadataUrl: string };

/**
 * The SP URLs for a provider. `authAppUrl` is the auth app's origin (AUTH_APP_URL): Better
 * Auth serves its endpoints under /api/auth there. The SP entity ID is the metadata URL, a
 * common convention that makes it unique per provider and resolvable.
 */
export function samlServiceProviderUrls(authAppUrl: string, providerId: string): SamlServiceProviderUrls {
  const base = `${authAppUrl.replace(/\/+$/, "")}/api/auth`;
  const id = encodeURIComponent(providerId);
  const metadataUrl = `${base}/sso/saml2/sp/metadata?providerId=${id}`;
  return { acsUrl: `${base}/sso/saml2/sp/acs/${id}`, entityId: metadataUrl, metadataUrl };
}

// ---------------------------------------------------------------------------------------------
// Attribute mapping
// ---------------------------------------------------------------------------------------------

export type SamlMapping = { email: string; name: string; firstName?: string; lastName?: string };
export const SAML_PRESETS = ["okta", "entra", "google", "jumpcloud", "custom"] as const;
export type SamlPreset = (typeof SAML_PRESETS)[number];

const CLAIMS = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims";

/**
 * Attribute names each IdP sends (Entra ID by default; Okta, Google Workspace and JumpCloud
 * once the attribute statements from the README are added). The user ID is always the
 * assertion's NameID: the plugin does not read it from an attribute.
 */
export const SAML_PRESET_MAPPINGS: Record<Exclude<SamlPreset, "custom">, SamlMapping> = {
  okta: { email: "email", name: "displayName", firstName: "firstName", lastName: "lastName" },
  entra: {
    email: `${CLAIMS}/emailaddress`,
    name: "http://schemas.microsoft.com/identity/claims/displayname",
    firstName: `${CLAIMS}/givenname`,
    lastName: `${CLAIMS}/surname`,
  },
  google: { email: "email", name: "displayName", firstName: "firstName", lastName: "lastName" },
  jumpcloud: { email: "email", name: "displayName", firstName: "firstname", lastName: "lastname" },
};

const ATTRIBUTE_NAME = /^[^\s<>"'&]{1,256}$/;

/** Trims the mapping and drops empty optional fields; null when a name is unusable. */
export function normalizeSamlMapping(mapping: Partial<SamlMapping>): SamlMapping | null {
  const clean = (v: string | undefined) => (typeof v === "string" ? v.trim() : "");
  const email = clean(mapping.email);
  const name = clean(mapping.name);
  const firstName = clean(mapping.firstName);
  const lastName = clean(mapping.lastName);
  for (const value of [email, name, firstName, lastName]) {
    if (value && !ATTRIBUTE_NAME.test(value)) return null;
  }
  if (!email || !name) return null;
  return { email, name, ...(firstName ? { firstName } : {}), ...(lastName ? { lastName } : {}) };
}
