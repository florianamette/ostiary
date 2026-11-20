import { z } from "zod";

import { CUSTOM_CLAIMS_MAX_BYTES, RESERVED_CLAIMS as API_RESERVED_CLAIMS } from "@ostiary/core/lib/oauth-resource-policy";

/**
 * Per-application custom claims (`oauth_client_claims`): the declarative equivalent of an Auth0
 * Action that adds claims. Each claim is a name, the tokens it goes into, and a value that is
 * either a fixed JSON value or one attribute from a fixed list (below). Nothing is evaluated:
 * no scripts, no paths into the database. Pure code, shared by the admin console (editor and
 * preview), the auth server (where the claims are applied) and the tests.
 *
 * An API's own custom claims (`oauth_resource.custom_claims`, oauth-resource-policy.ts) are
 * static and go into every access token for that API, whatever the application; these follow the
 * application, into the ID token, the access token and UserInfo, and may depend on the user.
 */

/** Where a claim goes. */
export const CLAIM_TOKENS = ["id_token", "access_token", "userinfo"] as const;
export type ClaimToken = (typeof CLAIM_TOKENS)[number];

/**
 * The user and session attributes a claim can take its value from. Anything else is refused,
 * at save and when a token is issued.
 */
export const CLAIM_ATTRIBUTES = [
  "user.role",
  "user.email_verified",
  "user.username",
  "user.two_factor_enabled",
  "organization.id",
  "organization.slug",
  "organization.role",
  "organizations",
] as const;
export type ClaimAttribute = (typeof CLAIM_ATTRIBUTES)[number];

/** Limits: claims ride in every token the application gets. */
export const CLIENT_CLAIMS_LIMITS = {
  /** Claims per application. */
  maxClaims: 20,
  /** The whole definition, serialized (the same limit as an API's custom claims). */
  maxBytes: CUSTOM_CLAIMS_MAX_BYTES,
  /** Characters in a claim name. */
  maxNameLength: 200,
  /** Nesting of a static value (an object in an array in an object...). */
  maxDepth: 4,
  /** Organizations listed by the `organizations` attribute. */
  maxOrganizations: 50,
} as const;

/** Letters, digits and `_ . : / -`; URL-style names such as `https://example.com/tenant` fit. */
const CLAIM_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.:/-]*$/;

/**
 * Claim names an application's claims can never set. The authorization server owns the
 * registered JWT, OIDC and OAuth claims; Ostiary already sets `role` (access tokens) and the
 * OIDC profile and email claims (ID token, UserInfo); introspection answers carry `active` and
 * `token_type`. Better Auth also keeps its own claims over any extension's, this refuses them
 * up front so an admin never configures a claim that silently does nothing.
 */
export const CLIENT_RESERVED_CLAIMS: readonly string[] = [
  ...new Set([
    ...API_RESERVED_CLAIMS,
    // JWT, OIDC Core and OAuth claims the server owns.
    "nonce",
    "at_hash",
    "c_hash",
    "s_hash",
    "typ",
    "events",
    "active",
    "token_type",
    // OIDC standard claims (Ostiary sets name, picture, email and email_verified).
    "name",
    "given_name",
    "family_name",
    "middle_name",
    "nickname",
    "preferred_username",
    "profile",
    "picture",
    "website",
    "email",
    "email_verified",
    "gender",
    "birthdate",
    "zoneinfo",
    "locale",
    "phone_number",
    "phone_number_verified",
    "address",
    "updated_at",
  ]),
];

/** Keys that would reach an object's prototype when claims are merged. */
const UNSAFE_NAMES = new Set(["__proto__", "constructor", "prototype"]);

export type JsonValue = string | number | boolean | JsonValue[] | { [key: string]: JsonValue };

export type ClientClaim = {
  name: string;
  tokens: ClaimToken[];
} & ({ source: "static"; value: JsonValue } | { source: "attribute"; attribute: ClaimAttribute });

/**
 * The shape of a claims definition, as the admin console sends it and as it is stored. The
 * rules that need a message for the admin (names, reserved claims, limits) are in
 * validateClientClaims.
 */
export const clientClaimSchema = z.discriminatedUnion("source", [
  z.object({
    name: z.string().max(1000),
    tokens: z.array(z.enum(CLAIM_TOKENS)).max(CLAIM_TOKENS.length),
    source: z.literal("static"),
    value: z.unknown(),
  }),
  z.object({
    name: z.string().max(1000),
    tokens: z.array(z.enum(CLAIM_TOKENS)).max(CLAIM_TOKENS.length),
    source: z.literal("attribute"),
    // Checked against CLAIM_ATTRIBUTES by validateClientClaims, which says which exist.
    attribute: z.string().max(200),
  }),
]);
export const clientClaimsSchema = z.array(clientClaimSchema).max(1000);

/**
 * Why a claims definition was refused: `error` in English (logs, tests) and `issue`, a code with
 * its values, for the console to show in the admin's language.
 */
export type ClientClaimsIssue =
  | { code: "invalid" | "nameMissing"; values: Record<string, never> }
  | { code: "tooMany"; values: { max: number } }
  | { code: "tooLarge"; values: { kilobytes: number } }
  | { code: "nameInvalid" | "nameReserved" | "nameDuplicate" | "noTokens" | "valueInvalid" | "attributeUnknown"; values: { name: string } };

export type ClientClaimsResult = { ok: true; value: ClientClaim[] } | { ok: false; error: string; issue: ClientClaimsIssue };

function refuse(issue: ClientClaimsIssue, error: string): ClientClaimsResult {
  return { ok: false, error, issue };
}

/** A plain JSON value, not null, at most `maxDepth` levels deep, with safe object keys. */
function isClaimValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > CLIENT_CLAIMS_LIMITS.maxDepth) return false;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isClaimValue(item, depth + 1));
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.entries(value).every(([key, item]) => !UNSAFE_NAMES.has(key) && isClaimValue(item, depth + 1));
  }
  return false;
}

export function isClaimAttribute(value: string): value is ClaimAttribute {
  return (CLAIM_ATTRIBUTES as readonly string[]).includes(value);
}

export function isReservedClaim(name: string): boolean {
  return CLIENT_RESERVED_CLAIMS.includes(name);
}

/**
 * Checks a claims definition: the shape, at most 20 claims with unique, well-formed names that
 * are not reserved, at least one token each, a valid static value or a known attribute, and 4 KB
 * at most serialized. Run by the admin console before saving, and again on the stored value
 * before any claim goes into a token.
 */
export function validateClientClaims(input: unknown): ClientClaimsResult {
  const parsed = clientClaimsSchema.safeParse(input);
  if (!parsed.success) return refuse({ code: "invalid", values: {} }, "The claims are not in the expected format.");
  const claims = parsed.data;
  const { maxClaims, maxBytes, maxNameLength } = CLIENT_CLAIMS_LIMITS;
  if (claims.length > maxClaims) {
    return refuse({ code: "tooMany", values: { max: maxClaims } }, `An application can have at most ${maxClaims} custom claims.`);
  }
  const seen = new Set<string>();
  const out: ClientClaim[] = [];
  for (const claim of claims) {
    const name = claim.name.trim();
    if (!name) return refuse({ code: "nameMissing", values: {} }, "Enter a name for each claim.");
    if (name.length > maxNameLength || !CLAIM_NAME_PATTERN.test(name) || UNSAFE_NAMES.has(name)) {
      return refuse(
        { code: "nameInvalid", values: { name } },
        `"${name}" is not a valid claim name: letters, digits and _ . : / - only, starting with a letter or _, ${maxNameLength} characters at most.`,
      );
    }
    if (isReservedClaim(name)) {
      return refuse({ code: "nameReserved", values: { name } }, `"${name}" is a reserved claim: the server sets it.`);
    }
    if (seen.has(name)) return refuse({ code: "nameDuplicate", values: { name } }, `The claim "${name}" is defined twice.`);
    seen.add(name);
    const tokens = CLAIM_TOKENS.filter((token) => claim.tokens.includes(token));
    if (tokens.length === 0) {
      return refuse({ code: "noTokens", values: { name } }, `Choose at least one token for the claim "${name}".`);
    }
    if (claim.source === "static") {
      if (!isClaimValue(claim.value)) {
        return refuse(
          { code: "valueInvalid", values: { name } },
          `The value of "${name}" must be a string, a number, true or false, or a JSON array or object (no null, ${CLIENT_CLAIMS_LIMITS.maxDepth} levels deep at most).`,
        );
      }
      out.push({ name, tokens, source: "static", value: claim.value });
    } else {
      if (!isClaimAttribute(claim.attribute)) {
        return refuse({ code: "attributeUnknown", values: { name } }, `The claim "${name}" uses an unknown attribute.`);
      }
      out.push({ name, tokens, source: "attribute", attribute: claim.attribute });
    }
  }
  if (new TextEncoder().encode(JSON.stringify(out)).length > maxBytes) {
    return refuse(
      { code: "tooLarge", values: { kilobytes: maxBytes / 1024 } },
      `The custom claims are too large (${maxBytes / 1024} KB at most): they are added to every token.`,
    );
  }
  return { ok: true, value: out };
}

/** One organization the user belongs to. */
export type ClaimOrganization = { id: string; slug: string; role: string };

/**
 * What attribute claims are read from. `user` is null for a token without a user (client
 * credentials): every attribute claim is then left out. `organization` is the session's active
 * organization, null when there is none or no session; `organizations` is null when not loaded.
 */
export type ClaimContext = {
  user: {
    role: string | null;
    emailVerified: boolean;
    username: string | null;
    twoFactorEnabled: boolean;
  } | null;
  organization: ClaimOrganization | null;
  organizations: ClaimOrganization[] | null;
};

/** The value of an attribute, or undefined to leave the claim out. */
export function attributeValue(attribute: ClaimAttribute, context: ClaimContext): JsonValue | undefined {
  const { user } = context;
  if (!user) return undefined;
  switch (attribute) {
    case "user.role":
      return user.role ?? undefined;
    case "user.email_verified":
      return user.emailVerified;
    case "user.username":
      return user.username ?? undefined;
    case "user.two_factor_enabled":
      return user.twoFactorEnabled;
    case "organization.id":
      return context.organization?.id;
    case "organization.slug":
      return context.organization?.slug;
    case "organization.role":
      return context.organization?.role;
    case "organizations":
      return context.organizations
        ?.slice(0, CLIENT_CLAIMS_LIMITS.maxOrganizations)
        .map(({ id, slug, role }) => ({ id, slug, role }));
  }
}

/** Which context a set of claims needs, so the auth server loads only that. */
export function claimNeeds(claims: readonly ClientClaim[], token: ClaimToken) {
  const attributes = new Set(
    claims.flatMap((claim) => (claim.source === "attribute" && claim.tokens.includes(token) ? [claim.attribute] : [])),
  );
  return {
    user: attributes.size > 0,
    organization: [...attributes].some((attribute) => attribute.startsWith("organization.")),
    organizations: attributes.has("organizations"),
  };
}

/**
 * The claims for one token: those defined for it, with attribute values from `context`
 * (left out when there is no value). Reserved names are skipped again, whatever was stored.
 */
export function buildClientClaims(claims: readonly ClientClaim[], token: ClaimToken, context: ClaimContext): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = Object.create(null);
  for (const claim of claims) {
    if (!claim.tokens.includes(token) || isReservedClaim(claim.name) || UNSAFE_NAMES.has(claim.name)) continue;
    const value = claim.source === "static" ? claim.value : attributeValue(claim.attribute, context);
    if (value !== undefined) out[claim.name] = value;
  }
  return { ...out };
}

/** The example user of the console's preview. */
export const EXAMPLE_CLAIM_CONTEXT: ClaimContext = {
  user: { role: "user", emailVerified: true, username: "ada", twoFactorEnabled: true },
  organization: { id: "org_8Kq2", slug: "acme", role: "admin" },
  organizations: [
    { id: "org_8Kq2", slug: "acme", role: "admin" },
    { id: "org_3Tz9", slug: "globex", role: "member" },
  ],
};

/** The machine-to-machine (client credentials) case: no user, no session. */
export const MACHINE_CLAIM_CONTEXT: ClaimContext = { user: null, organization: null, organizations: null };
