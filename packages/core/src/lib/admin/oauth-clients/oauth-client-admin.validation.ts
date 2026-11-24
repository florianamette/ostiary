import { z } from "zod";
import { isUsableLogoUri } from "@ostiary/core/lib/app-icons/site";
import { ENV_API_SCOPES, OIDC_SCOPES } from "@ostiary/core/lib/oauth-scopes";

import {
  DEVICE_CODE_GRANT_TYPE,
  isMachineClient,
  type ClientJwks,
  type CreateOAuthClientAdminInput,
  type UpdateOAuthClientAdminInput,
} from "@ostiary/core/lib/admin/oauth-clients/oauth-client-admin.types";

export type BodyParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const tokenEndpointAuthMethodSchema = z.enum([
  "none",
  "client_secret_basic",
  "client_secret_post",
  "private_key_jwt",
]);

/** Private members of a JWK: a JWKS registered for an app holds its public keys only. */
const PRIVATE_JWK_MEMBERS = ["d", "p", "q", "dp", "dq", "qi", "oth", "k"];
/** Members each key type needs. Symmetric keys (`oct`) are refused: they would be secrets. */
const REQUIRED_JWK_MEMBERS: Record<string, string[]> = { RSA: ["n", "e"], EC: ["crv", "x", "y"], OKP: ["crv", "x"] };
export const MAX_CLIENT_JWKS_KEYS = 10;

/**
 * Why `value` is not a JWKS of public keys an app can sign client assertions with
 * (`private_key_jwt`), or null. Better Auth checks the signature with them at the token endpoint.
 */
export function clientJwksError(value: unknown): string | null {
  const keys = (value as { keys?: unknown } | null)?.keys;
  if (!value || typeof value !== "object" || !Array.isArray(keys) || keys.length === 0) {
    return 'The JWKS must be a JSON object with a "keys" list.';
  }
  if (keys.length > MAX_CLIENT_JWKS_KEYS) return `The JWKS may hold at most ${MAX_CLIENT_JWKS_KEYS} keys.`;
  for (const key of keys as unknown[]) {
    if (!key || typeof key !== "object" || Array.isArray(key)) return "Each key in the JWKS must be a JSON object.";
    const jwk = key as Record<string, unknown>;
    const required = typeof jwk.kty === "string" ? REQUIRED_JWK_MEMBERS[jwk.kty] : undefined;
    if (!required) return "Each key must be an RSA, EC or OKP public key (kty).";
    if (PRIVATE_JWK_MEMBERS.some((member) => member in jwk)) {
      return "The JWKS holds a private key: register the public keys only.";
    }
    if (required.some((member) => typeof jwk[member] !== "string" || !jwk[member])) {
      return `An ${jwk.kty} key needs ${required.join(", ")}.`;
    }
  }
  return null;
}

const clientJwksSchema = z.record(z.string(), z.unknown()).superRefine((value, ctx) => {
  const error = clientJwksError(value);
  if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
});

export const BACKCHANNEL_LOGOUT_URI_MESSAGE = "The back-channel logout URI must be an https URL.";
/** https only, no fragment: Better Auth also refuses private and reserved addresses. */
const backchannelLogoutUriSchema = z
  .string()
  .trim()
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.hash && !url.username && !url.password;
    } catch {
      return false;
    }
  }, BACKCHANNEL_LOGOUT_URI_MESSAGE);

export const BACKCHANNEL_WITHOUT_USERS_MESSAGE =
  "Back-channel logout is for apps that sign users in (authorization_code).";
export const JWKS_WITHOUT_PRIVATE_KEY_JWT_MESSAGE =
  "A JWKS is for apps that authenticate with private_key_jwt, and private_key_jwt needs one.";

const oauthClientApplicationTypeSchema = z.enum([
  "web",
  "native",
  "user-agent-based",
]);

const oauthGrantTypeSchema = z.enum([
  "authorization_code",
  "client_credentials",
  "refresh_token",
  DEVICE_CODE_GRANT_TYPE,
]);

export const INVALID_LOGO_URI_MESSAGE =
  "The icon URL must be an https address on a public host (localhost and private addresses can't be fetched).";

/**
 * `logo_uri`, the app's icon: a URL the icon lookup will use (see `appIconSource`), or empty
 * or null for none.
 */
const logoUriSchema = z
  .string()
  .trim()
  .nullable()
  .optional()
  .refine((v) => !v || isUsableLogoUri(v), { message: INVALID_LOGO_URI_MESSAGE });

/** An icon URL set outside the JSON API (self-registered clients): the URL, or null to clear it. */
export function parseLogoUri(raw: unknown): BodyParseResult<string | null> {
  const parsed = logoUriSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: INVALID_LOGO_URI_MESSAGE };
  return { ok: true, value: parsed.data || null };
}

export const INVALID_LINK_URI_MESSAGE = "Policy and terms links must be https URLs.";

/** `policy_uri` and `tos_uri`: an https URL, or empty or null for none. */
const linkUriSchema = z
  .string()
  .trim()
  .max(2048)
  .nullable()
  .optional()
  .refine((v) => !v || (/^https:\/\/\S+$/i.test(v) && URL.canParse(v)), { message: INVALID_LINK_URI_MESSAGE });

/**
 * A space-separated scope list made only of `allScopes`, normalized to single spaces and
 * without repeats.
 */
const scopeListSchema = (allScopes: readonly string[]) =>
  z
    .string()
    .trim()
    .min(1)
    .refine(
      (s) => s.split(/\s+/).every((sc) => allScopes.includes(sc)),
      { message: `scope must only contain: ${allScopes.join(", ")}` },
    )
    .transform((s) => [...new Set(s.split(/\s+/))].join(" "));

export const POST_LOGOUT_WITHOUT_END_SESSION_MESSAGE =
  "post-logout redirect URIs need enable_end_session (RP-initiated logout)";

/**
 * Where the end-session endpoint may redirect after logout (exact match, like redirect URIs).
 * Better Auth checks each URL; an empty list clears them on update.
 */
const postLogoutRedirectUrisSchema = z.array(z.string().trim().min(1)).optional();

const DEFAULT_GRANT_TYPES = [
  "authorization_code",
  "refresh_token",
] as const;

export const PAIRWISE_WITHOUT_USERS_MESSAGE =
  "Pairwise user IDs are for apps that sign users in (authorization_code).";

/**
 * A client ID chosen by an admin: 3 to 128 letters, digits, `.`, `_` or `-`, enough for the IDs
 * of Auth0, Keycloak, Cognito, Okta or Entra. No `:` or `/`, which a client ID that is a URL
 * (a Client ID Metadata Document) has.
 */
export const CUSTOM_CLIENT_ID_PATTERN = /^[A-Za-z0-9._-]{3,128}$/;
export const INVALID_CLIENT_ID_MESSAGE =
  "A client ID has 3 to 128 letters, digits, dots, underscores or hyphens.";

/**
 * Body schema for creating a client. `apiScopes` are the API scopes currently registered
 * (`currentApiScopes()`); they change at runtime, so the schema is built per request.
 */
export const createOAuthClientBodySchema = (apiScopes: readonly string[] = ENV_API_SCOPES) => {
  const allScopes: readonly string[] = [...OIDC_SCOPES, ...apiScopes];
  return z
    .object({
      // Only the authorization_code grant redirects (checked below): a machine client has none.
      redirect_uris: z.array(z.string().min(1)).optional().default([]),
      client_name: z.string().optional(),
      // Empty or left out: Better Auth generates one.
      client_id: z
        .string()
        .trim()
        .transform((id) => id || undefined)
        .pipe(z.string().regex(CUSTOM_CLIENT_ID_PATTERN, INVALID_CLIENT_ID_MESSAGE).optional())
        .optional(),
      token_endpoint_auth_method: tokenEndpointAuthMethodSchema.default(
        "client_secret_basic",
      ),
      grant_types: z
        .array(oauthGrantTypeSchema)
        .optional()
        .default([...DEFAULT_GRANT_TYPES]),
      // Only "code" exists here. Better Auth 1.7 requires it to match the grants: present with
      // authorization_code, absent otherwise (machine clients), so it is derived below.
      response_types: z.array(z.literal("code")).optional(),
      type: oauthClientApplicationTypeSchema.optional(),
      skip_consent: z.boolean().optional().default(false),
      // OpenID Connect Back-Channel Logout: Ostiary posts a logout token there when the user's
      // session ends. Needs sessions, so the authorization_code grant (checked below).
      backchannel_logout_uri: backchannelLogoutUriSchema.optional(),
      backchannel_logout_session_required: z.boolean().optional(),
      // The app's public keys, with token_endpoint_auth_method "private_key_jwt". No jwks_uri:
      // Better Auth only fetches one from Ostiary's own (trusted) origins.
      jwks: clientJwksSchema.optional(),
      // "pairwise": the app gets a `sub` of its own (PAIRWISE_SECRET). Set on create only.
      subject_type: z.enum(["public", "pairwise"]).optional(),
      // Off unless asked for, as in Better Auth: the console's dialog asks for it explicitly.
      enable_end_session: z.boolean().optional().default(false),
      post_logout_redirect_uris: postLogoutRedirectUrisSchema,
      logo_uri: logoUriSchema,
      policy_uri: linkUriSchema,
      tos_uri: linkUriSchema,
      scope: scopeListSchema(allScopes).optional(),
      // APIs to link the client to (Better Auth's oauth_client_resource), by identifier.
      resources: z.array(z.string().trim().url()).max(100).optional().default([]),
    })
    .strict()
    .superRefine((v, ctx) => {
      if (v.post_logout_redirect_uris?.length && !v.enable_end_session) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["post_logout_redirect_uris"],
          message: POST_LOGOUT_WITHOUT_END_SESSION_MESSAGE,
        });
      }
      if ((v.token_endpoint_auth_method === "private_key_jwt") !== Boolean(v.jwks)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["jwks"], message: JWKS_WITHOUT_PRIVATE_KEY_JWT_MESSAGE });
      }
      if (
        (v.backchannel_logout_uri || v.backchannel_logout_session_required !== undefined) &&
        !v.grant_types.includes("authorization_code")
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["backchannel_logout_uri"],
          message: BACKCHANNEL_WITHOUT_USERS_MESSAGE,
        });
      }
      if (v.subject_type === "pairwise" && !v.grant_types.includes("authorization_code")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["subject_type"],
          message: PAIRWISE_WITHOUT_USERS_MESSAGE,
        });
      }
      if (v.grant_types.includes("authorization_code") && v.redirect_uris.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["redirect_uris"],
          message: "authorization_code clients need at least one redirect URI",
        });
      }
      if (!v.grant_types.includes("client_credentials")) return;
      // Better Auth gives public clients no machine scopes: their tokens would all be refused.
      if (v.token_endpoint_auth_method === "none") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["token_endpoint_auth_method"],
          message: "client_credentials clients must be confidential (client secret or private_key_jwt)",
        });
      }
      // A client without scopes may request every server scope, so machine
      // clients must be limited to explicit API scopes.
      const scopes = v.scope?.split(/\s+/) ?? [];
      if (scopes.length === 0 || !scopes.every((sc) => apiScopes.includes(sc))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["scope"],
          message: `client_credentials clients need explicit API scopes: ${apiScopes.join(", ")}`,
        });
      }
    });
};

export type CreateOAuthClientBodyInput = z.input<
  ReturnType<typeof createOAuthClientBodySchema>
>;

/**
 * Body schema for updating a client. `apiScopes` as for `createOAuthClientBodySchema`.
 */
const updateOAuthClientBodySchema = (apiScopes: readonly string[] = ENV_API_SCOPES) => z
  .object({
    client_name: z.string().optional(),
    redirect_uris: z.array(z.string().min(1)).min(1).optional(),
    skip_consent: z.boolean().optional(),
    enable_end_session: z.boolean().optional(),
    post_logout_redirect_uris: postLogoutRedirectUrisSchema,
    device_code: z.boolean().optional(),
    // Empty or null clears it.
    logo_uri: logoUriSchema,
    // Null lifts the limit.
    scope: scopeListSchema([...OIDC_SCOPES, ...apiScopes]).nullable().optional(),
    resources: z.array(z.string().trim().url()).max(100).optional(),
    // Empty or null clears them.
    policy_uri: linkUriSchema,
    tos_uri: linkUriSchema,
    // Empty or null turns back-channel logout off.
    backchannel_logout_uri: z.union([z.literal(""), backchannelLogoutUriSchema]).nullable().optional(),
    backchannel_logout_session_required: z.boolean().optional(),
    // Replaces the keys of a private_key_jwt app (checked against the stored method).
    jwks: clientJwksSchema.optional(),
  })
  .strict()
  .refine(
    (data) => Object.entries(data).some(([key, value]) => key !== "resources" && value !== undefined),
    { message: "No updatable fields provided" },
  )
  .refine(
    (data) => !(data.enable_end_session === false && data.post_logout_redirect_uris?.length),
    { path: ["post_logout_redirect_uris"], message: POST_LOGOUT_WITHOUT_END_SESSION_MESSAGE },
  )
  .transform((data): UpdateOAuthClientAdminInput => {
    const out: UpdateOAuthClientAdminInput = {};
    if (data.client_name !== undefined) {
      out.client_name = data.client_name.trim() || undefined;
    }
    if (data.redirect_uris !== undefined) {
      out.redirect_uris = data.redirect_uris;
    }
    if (data.skip_consent !== undefined) {
      out.skip_consent = data.skip_consent;
    }
    if (data.enable_end_session !== undefined) {
      out.enable_end_session = data.enable_end_session;
    }
    if (data.post_logout_redirect_uris !== undefined) {
      out.post_logout_redirect_uris = data.post_logout_redirect_uris;
    }
    if (data.device_code !== undefined) {
      out.device_code = data.device_code;
    }
    if (data.logo_uri !== undefined) {
      out.logo_uri = data.logo_uri || null;
    }
    if (data.scope !== undefined) {
      out.scope = data.scope;
    }
    if (data.resources?.length) {
      out.resources = [...new Set(data.resources)];
    }
    if (data.policy_uri !== undefined) {
      out.policy_uri = data.policy_uri || null;
    }
    if (data.tos_uri !== undefined) {
      out.tos_uri = data.tos_uri || null;
    }
    if (data.backchannel_logout_uri !== undefined) {
      out.backchannel_logout_uri = data.backchannel_logout_uri || null;
    }
    if (data.backchannel_logout_session_required !== undefined) {
      out.backchannel_logout_session_required = data.backchannel_logout_session_required;
    }
    if (data.jwks !== undefined) {
      out.jwks = data.jwks as ClientJwks;
    }
    return out;
  });

/**
 * A client's grants with the device code grant added or removed. A client stored without grants
 * has Better Auth's default, authorization_code.
 */
export function withDeviceCodeGrant(
  grantTypes: readonly string[] | null | undefined,
  enabled: boolean,
): string[] {
  const current = grantTypes?.length ? [...grantTypes] : ["authorization_code"];
  const others = current.filter((grant) => grant !== DEVICE_CODE_GRANT_TYPE);
  return enabled ? [...others, DEVICE_CODE_GRANT_TYPE] : others;
}

/**
 * Why a device code grant change is refused, or null. A machine-to-machine client signs no
 * user in: it gets no device sign-in.
 */
export function deviceCodeUpdateError(
  grantTypes: readonly string[] | null | undefined,
  enabled: boolean,
): string | null {
  return enabled && isMachineClient(grantTypes)
    ? "A machine-to-machine client (client_credentials only) cannot use device sign-in."
    : null;
}

/**
 * Validates and normalizes the JSON body for POST /api/admin/oauth-clients.
 */
export function parseCreateOAuthClientBody(
  raw: unknown,
  apiScopes?: readonly string[],
): BodyParseResult<CreateOAuthClientAdminInput> {
  const parsed = createOAuthClientBodySchema(apiScopes).safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const msg = first
      ? `${first.path.join(".") || "body"}: ${first.message}`
      : "Invalid request body";
    return { ok: false, error: msg };
  }
  const v = parsed.data;
  return {
    ok: true,
    value: {
      redirect_uris: v.redirect_uris,
      client_name: v.client_name,
      ...(v.client_id ? { client_id: v.client_id } : {}),
      token_endpoint_auth_method: v.token_endpoint_auth_method,
      grant_types: v.grant_types,
      response_types: v.grant_types.includes("authorization_code") ? ["code"] : [],
      type: v.type,
      skip_consent: v.skip_consent,
      ...(v.subject_type === "pairwise" ? { subject_type: "pairwise" as const } : {}),
      ...(v.backchannel_logout_uri ? { backchannel_logout_uri: v.backchannel_logout_uri } : {}),
      ...(v.backchannel_logout_session_required !== undefined
        ? { backchannel_logout_session_required: v.backchannel_logout_session_required }
        : {}),
      ...(v.jwks ? { jwks: v.jwks as ClientJwks } : {}),
      enable_end_session: v.enable_end_session,
      ...(v.post_logout_redirect_uris?.length
        ? { post_logout_redirect_uris: v.post_logout_redirect_uris }
        : {}),
      logo_uri: v.logo_uri || undefined,
      scope: v.scope,
      resources: [...new Set(v.resources)],
      ...(v.policy_uri ? { policy_uri: v.policy_uri } : {}),
      ...(v.tos_uri ? { tos_uri: v.tos_uri } : {}),
    },
  };
}

/**
 * Validates and normalizes the JSON body for PATCH /api/admin/oauth-clients/[clientId].
 */
export function parseUpdateOAuthClientBody(
  raw: unknown,
  apiScopes?: readonly string[],
): BodyParseResult<UpdateOAuthClientAdminInput> {
  const parsed = updateOAuthClientBodySchema(apiScopes).safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const msg = first
      ? `${first.path.join(".") || "body"}: ${first.message}`
      : "Invalid request body";
    return { ok: false, error: msg };
  }
  return { ok: true, value: parsed.data };
}
