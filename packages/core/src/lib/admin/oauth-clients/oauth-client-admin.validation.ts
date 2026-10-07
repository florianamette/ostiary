import { z } from "zod";
import { API_SCOPES, ALL_SCOPES } from "@ostiary/core/lib/oauth-scopes";

import type {
  CreateOAuthClientAdminInput,
  UpdateOAuthClientAdminInput,
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
]);

const DEFAULT_GRANT_TYPES = [
  "authorization_code",
  "refresh_token",
] as const;

export const createOAuthClientBodySchema = z
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
    scope: z
      .string()
      .trim()
      .min(1)
      .refine(
        (s) => s.split(/\s+/).every((sc) => (ALL_SCOPES as readonly string[]).includes(sc)),
        { message: `scope must only contain: ${ALL_SCOPES.join(", ")}` },
      )
      .optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    // A client without scopes may request every server scope, so machine
    // clients must be limited to explicit API scopes.
    if (!v.grant_types.includes("client_credentials")) return;
    const scopes = v.scope?.split(/\s+/) ?? [];
    if (scopes.length === 0 || !scopes.every((sc) => (API_SCOPES as readonly string[]).includes(sc))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scope"],
        message: `client_credentials clients need explicit API scopes: ${API_SCOPES.join(", ")}`,
      });
    }
  });

export type CreateOAuthClientBodyInput = z.input<
  typeof createOAuthClientBodySchema
>;

export const updateOAuthClientBodyTransformSchema = z
  .object({
    client_name: z.string().optional(),
    redirect_uris: z.array(z.string().min(1)).min(1).optional(),
    skip_consent: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.client_name !== undefined ||
      data.redirect_uris !== undefined ||
      data.skip_consent !== undefined,
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
    return out;
  });

/**
 * Validates and normalizes the JSON body for POST /api/admin/oauth-clients.
 */
export function parseCreateOAuthClientBody(
  raw: unknown,
): BodyParseResult<CreateOAuthClientAdminInput> {
  const parsed = createOAuthClientBodySchema.safeParse(raw);
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
