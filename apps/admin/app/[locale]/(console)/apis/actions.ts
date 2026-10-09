"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import { db } from "@ostiary/core/db/index";
import { oauthClientResource } from "@ostiary/core/db/schema";
import { env } from "@ostiary/core/lib/env";
import { oauthResourceIdentifiers } from "@ostiary/core/lib/oauth-resources";
import {
  parseTokenSettings,
  resourceAccess,
  type ApiAccess,
  type OAuthResourceMetadata,
  type TokenSettingsInput,
} from "@ostiary/core/lib/oauth-resource-policy";
import { invalidateApiScopes, OIDC_SCOPES } from "@ostiary/core/lib/oauth-scopes";
import { adminActor } from "@/lib/admin-audit";
import { auth } from "@/lib/auth";

/*
 * APIs are Better Auth's OAuth protected resources (`oauth_resource`), changed through its
 * admin endpoints. The scopes an API declares live in the row's metadata; when "restrict" is
 * on they are also its `allowedScopes`, so its tokens carry nothing else (plus the OIDC
 * scopes, so sign-in keeps working). Without it, its tokens still never carry another API's
 * scopes (withApiScopeBinding). The auth app picks up new scopes within a minute.
 *
 * Access ("every application" or "only linked applications") is `metadata.access`, and the
 * links are Better Auth's `oauth_client_resource` rows. Token settings are the row's own
 * policy columns, which Better Auth applies when it issues a token for the API. Both take
 * effect at once: the auth server reads them from the database on every token request.
 */

type Result = { ok: true } | { ok: false; error: string };

type Translator = Awaited<ReturnType<typeof getTranslations>>;

const errorsT = () => getTranslations("admin.pages.apis.errors");

/** RFC 6749 scope-token: printable ASCII except space, `"` and `\`. */
const SCOPE_TOKEN = /^[\x21\x23-\x5B\x5D-\x7E]+$/;

/** Resources registered from the environment: the build seeds them again if deleted. */
function configuredIdentifiers() {
  return new Set(oauthResourceIdentifiers(env.AUTH_APP_URL ?? ""));
}

function parseScopes(raw: string, t: Translator): { ok: true; scopes: string[] } | { ok: false; error: string } {
  const scopes = [...new Set(raw.split(/[\s,]+/).filter(Boolean))];
  const invalid = scopes.find((scope) => !SCOPE_TOKEN.test(scope));
  if (invalid) return { ok: false, error: t("invalidScope", { scope: invalid }) };
  const reserved = scopes.find((scope) => (OIDC_SCOPES as readonly string[]).includes(scope));
  if (reserved) return { ok: false, error: t("reservedScope", { scope: reserved }) };
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

/** The API's name and metadata (so an update keeps the metadata keys it does not change). */
async function currentApi(identifier: string): Promise<{ name: string; metadata: OAuthResourceMetadata }> {
  const row = (await auth.api.adminGetOAuthResource({ headers: await headers(), params: { identifier } })) as {
    name?: string;
    metadata?: unknown;
  };
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {};
  return { name: row.name ?? identifier, metadata: metadata as OAuthResourceMetadata };
}

function errorMessage(error: unknown, fallback: string): string {
  const body = (error as { body?: Record<string, unknown> } | null)?.body;
  const description = body?.error_description ?? body?.message;
  if (typeof description === "string" && description) return description;
  return error instanceof Error && error.message ? error.message : fallback;
}

export async function createApi(input: { identifier: string; name: string; scopes: string; restrict: boolean }): Promise<Result> {
  const { audit } = await adminActor();
  const t = await errorsT();
  const identifier = parseIdentifier(input.identifier);
  if (!identifier) return { ok: false, error: t("invalidIdentifier", { example: "https://api.example.com" }) };
  const parsed = parseScopes(input.scopes, t);
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
    return { ok: false, error: errorMessage(error, t("registerFailed")) };
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
  const t = await errorsT();
  const parsed = parseScopes(input.scopes, t);
  if (!parsed.ok) return parsed;
  if (input.disabled && identifier === env.AUTH_APP_URL) {
    return { ok: false, error: t("authServerCannotBeDisabled") };
  }
  const name = input.name.trim() || identifier;
  try {
    const { metadata } = await currentApi(identifier);
    await auth.api.adminUpdateOAuthResource({
      headers: await headers(),
      params: { identifier },
      body: {
        name,
        metadata: { ...metadata, scopes: parsed.scopes },
        allowedScopes: input.restrict ? [...OIDC_SCOPES, ...parsed.scopes] : null,
        disabled: input.disabled,
      },
    });
  } catch (error) {
    return { ok: false, error: errorMessage(error, t("updateFailed")) };
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
  const t = await errorsT();
  if (configuredIdentifiers().has(identifier)) {
    return { ok: false, error: t("deleteFromEnv", { variable: "OAUTH_API_AUDIENCES" }) };
  }
  try {
    await auth.api.adminDeleteOAuthResource({ headers: await headers(), params: { identifier } });
  } catch (error) {
    return { ok: false, error: errorMessage(error, t("deleteFailed")) };
  }
  invalidateApiScopes();
  await audit({ action: "oauth_resource.delete", target: { type: "oauth_resource", id: identifier, label: identifier } });
  return { ok: true };
}

/**
 * Sets who may get tokens for the API and which applications are linked to it. Links are
 * added before the mode changes and removed after, so no client is ever refused while the
 * new setting is being saved. A linked application may also introspect the API's tokens.
 */
export async function setApiAccess(identifier: string, input: { access: ApiAccess; clientIds: string[] }): Promise<Result> {
  const { audit } = await adminActor();
  const t = await errorsT();
  if (input.access === "linked" && identifier === env.AUTH_APP_URL) {
    return { ok: false, error: t("authServerStaysOpen") };
  }
  const wanted = new Set(input.clientIds);
  const current = new Set(
    (
      await db
        .select({ clientId: oauthClientResource.clientId })
        .from(oauthClientResource)
        .where(eq(oauthClientResource.resourceId, identifier))
    ).map((row) => row.clientId),
  );
  const added = [...wanted].filter((clientId) => !current.has(clientId));
  const removed = [...current].filter((clientId) => !wanted.has(clientId));
  const requestHeaders = await headers();
  // What was actually changed, audited even when a later step fails.
  const done = { linked: [] as string[], unlinked: [] as string[], access: false };
  let name = identifier;
  let error: string | null = null;
  try {
    const api = await currentApi(identifier);
    name = api.name;
    for (const clientId of added) {
      await auth.api.adminLinkClientResource({ headers: requestHeaders, params: { identifier, client_id: clientId } });
      done.linked.push(clientId);
    }
    if (resourceAccess(api.metadata) !== input.access) {
      await auth.api.adminUpdateOAuthResource({
        headers: requestHeaders,
        params: { identifier },
        body: { metadata: { ...api.metadata, access: input.access } },
      });
      done.access = true;
    }
    for (const clientId of removed) {
      await auth.api.adminUnlinkClientResource({ headers: requestHeaders, params: { identifier, client_id: clientId } });
      done.unlinked.push(clientId);
    }
  } catch (caught) {
    error = errorMessage(caught, t("accessFailed"));
  }
  if (done.linked.length || done.unlinked.length || done.access) {
    await audit({
      action: "oauth_resource.access",
      target: { type: "oauth_resource", id: identifier, label: name },
      metadata: { access: done.access ? input.access : undefined, linked: done.linked, unlinked: done.unlinked },
    });
  }
  return error ? { ok: false, error } : { ok: true };
}

/** Saves the API's token settings: lifetimes, custom claims, DPoP. */
export async function updateApiTokens(identifier: string, input: TokenSettingsInput): Promise<Result> {
  const { audit } = await adminActor();
  const t = await errorsT();
  const parsed = parseTokenSettings(input);
  if (!parsed.ok) return { ok: false, error: t(`tokenSettings.${parsed.issue.code}`, parsed.issue.values) };
  let name = identifier;
  try {
    const row = await auth.api.adminUpdateOAuthResource({ headers: await headers(), params: { identifier }, body: parsed.value });
    name = (row as { name?: string }).name ?? identifier;
  } catch (error) {
    return { ok: false, error: errorMessage(error, t("tokensFailed")) };
  }
  const { customClaims, ...settings } = parsed.value;
  await audit({
    action: "oauth_resource.tokens",
    target: { type: "oauth_resource", id: identifier, label: name },
    // Claim names only: their values are the API's business.
    metadata: { ...settings, customClaims: Object.keys(customClaims ?? {}) },
  });
  return { ok: true };
}
