import { z } from "zod";
import { isUsableLogoUri } from "@ostiary/core/lib/app-icons/site";
import { ENV_API_SCOPES, OIDC_SCOPES } from "@ostiary/core/lib/oauth-scopes";

import {
  DEVICE_CODE_GRANT_TYPE,
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
      redirect_uris: z.array(z.string().min(1)).min(1),
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
    })
    .strict()
    .superRefine((v, ctx) => {
      // A client without scopes may request every server scope, so machine
      // clients must be limited to explicit API scopes.
      if (!v.grant_types.includes("client_credentials")) return;
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
      data.device_code !== undefined ||
      data.logo_uri !== undefined,
    { message: "No updatable fields provided" },
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
 * Validates and normalizes the JSON body for POST /api/admin/oauth-clients.
 */
export function parseCreateOAuthClientBody(
  raw: unknown,
  apiScopes?: readonly string[],
): BodyParseResult<CreateOAuthClientAdminInput> {
  const parsed = createOAuthClientBodySchema(apiScopes).safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
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
      logo_uri: v.logo_uri || undefined,
      scope: v.scope?.split(/\s+/).join(" "),
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
    const first = parsed.error.errors[0];
    const msg = first
      ? `${first.path.join(".") || "body"}: ${first.message}`
      : "Invalid request body";
    return { ok: false, error: msg };
  }
  return { ok: true, value: parsed.data };
}
