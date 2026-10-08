"use server";

import { headers } from "next/headers";

import { env } from "@ostiary/core/lib/env";
import { oauthResourceIdentifiers } from "@ostiary/core/lib/oauth-resources";
import { invalidateApiScopes, OIDC_SCOPES } from "@ostiary/core/lib/oauth-scopes";
import { adminActor } from "@/lib/admin-audit";
import { auth } from "@/lib/auth";

/*
 * APIs are Better Auth's OAuth protected resources (`oauth_resource`), changed through its
 * admin endpoints. The scopes an API declares live in the row's metadata; when "restrict" is
 * on they are also its `allowedScopes`, so its tokens carry nothing else (plus the OIDC
 * scopes, so sign-in keeps working). The auth app picks up new scopes within a minute.
 */

type Result = { ok: true } | { ok: false; error: string };

/** RFC 6749 scope-token: printable ASCII except space, `"` and `\`. */
const SCOPE_TOKEN = /^[\x21\x23-\x5B\x5D-\x7E]+$/;

/** Resources registered from the environment: the build seeds them again if deleted. */
function configuredIdentifiers() {
  return new Set(oauthResourceIdentifiers(env.AUTH_APP_URL ?? ""));
}

function parseScopes(raw: string): { ok: true; scopes: string[] } | { ok: false; error: string } {
  const scopes = [...new Set(raw.split(/[\s,]+/).filter(Boolean))];
  const invalid = scopes.find((scope) => !SCOPE_TOKEN.test(scope));
  if (invalid) return { ok: false, error: `"${invalid}" is not a valid scope.` };
  const reserved = scopes.find((scope) => (OIDC_SCOPES as readonly string[]).includes(scope));
  if (reserved) return { ok: false, error: `"${reserved}" is an OpenID Connect scope, available to every client already.` };
  return { ok: true, scopes };
}

function parseIdentifier(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    return url.hash ? null : raw.trim();
  } catch {
    return null;
  }
}

function errorMessage(error: unknown, fallback: string): string {
  const body = (error as { body?: Record<string, unknown> } | null)?.body;
  const description = body?.error_description ?? body?.message;
  if (typeof description === "string" && description) return description;
  return error instanceof Error && error.message ? error.message : fallback;
}

export async function createApi(input: { identifier: string; name: string; scopes: string; restrict: boolean }): Promise<Result> {
  const { audit } = await adminActor();
  const identifier = parseIdentifier(input.identifier);
  if (!identifier) return { ok: false, error: "The identifier must be an absolute URL without a fragment, e.g. https://api.example.com." };
  const parsed = parseScopes(input.scopes);
  if (!parsed.ok) return parsed;
  const name = input.name.trim() || identifier;
  try {
    await auth.api.adminCreateOAuthResource({
      headers: await headers(),
      body: {
        identifier,
        name,
        metadata: { scopes: parsed.scopes },
        allowedScopes: input.restrict ? [...OIDC_SCOPES, ...parsed.scopes] : null,
      },
    });
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not register the API.") };
  }
  invalidateApiScopes();
  await audit({
    action: "oauth_resource.create",
    target: { type: "oauth_resource", id: identifier, label: name },
    metadata: { scopes: parsed.scopes, restrict: input.restrict },
  });
  return { ok: true };
}

export async function updateApi(
  identifier: string,
  input: { name: string; scopes: string; restrict: boolean; disabled: boolean },
): Promise<Result> {
  const { audit } = await adminActor();
  const parsed = parseScopes(input.scopes);
  if (!parsed.ok) return parsed;
  if (input.disabled && identifier === env.AUTH_APP_URL) {
    return { ok: false, error: "The auth server itself cannot be disabled." };
  }
  const name = input.name.trim() || identifier;
  try {
    await auth.api.adminUpdateOAuthResource({
      headers: await headers(),
      params: { identifier },
      body: {
        name,
        metadata: { scopes: parsed.scopes },
        allowedScopes: input.restrict ? [...OIDC_SCOPES, ...parsed.scopes] : null,
        disabled: input.disabled,
      },
    });
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not update the API.") };
  }
  invalidateApiScopes();
  await audit({
    action: "oauth_resource.update",
    target: { type: "oauth_resource", id: identifier, label: name },
    metadata: { scopes: parsed.scopes, restrict: input.restrict, disabled: input.disabled },
  });
  return { ok: true };
}

export async function deleteApi(identifier: string): Promise<Result> {
  const { audit } = await adminActor();
  if (configuredIdentifiers().has(identifier)) {
    return { ok: false, error: "This API is set in OAUTH_API_AUDIENCES and would come back on the next deploy. Disable it instead." };
  }
  try {
    await auth.api.adminDeleteOAuthResource({ headers: await headers(), params: { identifier } });
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not delete the API.") };
  }
  invalidateApiScopes();
  await audit({ action: "oauth_resource.delete", target: { type: "oauth_resource", id: identifier, label: identifier } });
  return { ok: true };
}
