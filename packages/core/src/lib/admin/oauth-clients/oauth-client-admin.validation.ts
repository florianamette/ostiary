import { z } from "zod";
import { isUsableLogoUri } from "@ostiary/core/lib/app-icons/site";
import { ENV_API_SCOPES, OIDC_SCOPES } from "@ostiary/core/lib/oauth-scopes";

import {
  DEVICE_CODE_GRANT_TYPE,
  isMachineClient,
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
]);

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
      // Off unless asked for, as in Better Auth: the console's dialog asks for it explicitly.
      enable_end_session: z.boolean().optional().default(false),
      post_logout_redirect_uris: postLogoutRedirectUrisSchema,
      logo_uri: logoUriSchema,
      scope: z
        .string()
        .trim()
        .min(1)
        .refine(
          (s) => s.split(/\s+/).every((sc) => allScopes.includes(sc)),
          { message: `scope must only contain: ${allScopes.join(", ")}` },
        )
        .optional(),
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
          message: "client_credentials clients must be confidential (client_secret_basic or client_secret_post)",
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

const updateOAuthClientBodyTransformSchema = z
  .object({
    client_name: z.string().optional(),
    redirect_uris: z.array(z.string().min(1)).min(1).optional(),
    skip_consent: z.boolean().optional(),
    enable_end_session: z.boolean().optional(),
    post_logout_redirect_uris: postLogoutRedirectUrisSchema,
    device_code: z.boolean().optional(),
    // Empty or null clears it.
    logo_uri: logoUriSchema,
  })
  .strict()
  .refine(
    (data) =>
      data.client_name !== undefined ||
      data.redirect_uris !== undefined ||
      data.skip_consent !== undefined ||
      data.enable_end_session !== undefined ||
      data.post_logout_redirect_uris !== undefined ||
      data.device_code !== undefined ||
      data.logo_uri !== undefined,
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
      token_endpoint_auth_method: v.token_endpoint_auth_method,
      grant_types: v.grant_types,
      response_types: v.grant_types.includes("authorization_code") ? ["code"] : [],
      type: v.type,
      skip_consent: v.skip_consent,
      enable_end_session: v.enable_end_session,
      ...(v.post_logout_redirect_uris?.length
        ? { post_logout_redirect_uris: v.post_logout_redirect_uris }
        : {}),
      logo_uri: v.logo_uri || undefined,
      scope: v.scope?.split(/\s+/).join(" "),
      resources: [...new Set(v.resources)],
    },
  };
}

/**
 * Validates and normalizes the JSON body for PATCH /api/admin/oauth-clients/[clientId].
 */
export function parseUpdateOAuthClientBody(
  raw: unknown,
): BodyParseResult<UpdateOAuthClientAdminInput> {
  const parsed = updateOAuthClientBodyTransformSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const msg = first
      ? `${first.path.join(".") || "body"}: ${first.message}`
      : "Invalid request body";
    return { ok: false, error: msg };
  }
  return { ok: true, value: parsed.data };
}
