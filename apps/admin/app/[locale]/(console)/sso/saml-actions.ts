"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@ostiary/core/db/index";
import { organization, ssoProvider, verification } from "@ostiary/core/db/schema";
import { env } from "@ostiary/core/lib/env";
import {
  buildSamlConfig,
  SAML_PROVIDER_ID_PATTERN,
  samlServiceProviderUrls,
  type SamlMapping,
} from "@ostiary/core/lib/saml";
import { fetchSamlMetadata } from "@ostiary/core/lib/saml-metadata-fetch";
import { adminActor } from "@/lib/admin-audit";
import { auth } from "@/lib/auth";

/*
 * SAML providers. Registration goes through the plugin's /sso/register (with the admin's
 * session), so it gets the plugin's own checks and the audit entry every registration gets
 * (`sso_provider.create`, written by the auth after-hook without the samlConfig). Before that,
 * Ostiary validates the IdP side (lib/saml.ts) and builds the samlConfig: SP entity ID and ACS
 * derived from AUTH_APP_URL, AuthnRequests unsigned, signed assertions required unless the
 * admin turns it off (a signed response is still required then: samlify refuses unsigned ones).
 */

type Result = { ok: true } | { ok: false; error: string };

export type SamlIdpFormInput =
  | { source: "xml"; xml: string }
  | { source: "url"; url: string }
  | { source: "manual"; entityId: string; ssoUrl: string; certificate: string };

export type SamlProviderInput = {
  idp: SamlIdpFormInput;
  mapping: SamlMapping;
  wantAssertionsSigned: boolean;
};

const verificationIdentifier = (providerId: string) => `_ostiary-${providerId}`;

function hostnameOf(domain: string): string | null {
  try {
    return new URL(domain.includes("://") ? domain : `https://${domain}`).hostname || null;
  } catch {
    return null;
  }
}

function metadataAllowLocalhost(): boolean {
  return env.WEBHOOKS_ALLOW_LOCALHOST === "true" && env.NODE_ENV !== "production";
}

/** Resolves the IdP input (fetching a metadata URL server-side) and builds the samlConfig. */
async function samlConfigFrom(input: SamlProviderInput) {
  let idp: { source: "xml"; xml: string } | { source: "manual"; entityId: string; ssoUrl: string; certificate: string };
  if (input.idp.source === "url") {
    const fetched = await fetchSamlMetadata(input.idp.url, { allowLocalhost: metadataAllowLocalhost() });
    if (!fetched.ok) return fetched;
    idp = { source: "xml", xml: fetched.xml };
  } else {
    idp = input.idp;
  }
  return buildSamlConfig({ idp, mapping: input.mapping, wantAssertionsSigned: input.wantAssertionsSigned });
}

function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const body = (error as { body?: { message?: unknown } }).body;
    if (typeof body?.message === "string" && body.message) return body.message;
    if (error instanceof Error && error.message) return error.message;
  }
  return fallback;
}

export async function registerSamlProvider(
  input: SamlProviderInput & { providerId: string; domain: string; organizationId: string | null },
): Promise<Result> {
  const { audit } = await adminActor();
  if (!env.AUTH_APP_URL) return { ok: false, error: "AUTH_APP_URL is not set." };
  const providerId = input.providerId.trim();
  if (!SAML_PROVIDER_ID_PATTERN.test(providerId)) {
    return { ok: false, error: "The provider ID must be 2 to 63 lowercase letters, digits, - or _." };
  }
  const domain = input.domain.trim().toLowerCase();
  if (!hostnameOf(domain) || domain.includes("/")) return { ok: false, error: "Enter an email domain, e.g. acme.com." };
  if (input.organizationId) {
    const [org] = await db.select({ id: organization.id }).from(organization).where(eq(organization.id, input.organizationId));
    if (!org) return { ok: false, error: "Organization not found." };
  }
  const built = await samlConfigFrom(input);
  if (!built.ok) return built;
  const sp = samlServiceProviderUrls(env.AUTH_APP_URL, providerId);
  try {
    await auth.api.registerSSOProvider({
      headers: await headers(),
      body: { providerId, issuer: sp.entityId, domain, samlConfig: built.config },
    });
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not register the provider.") };
  }
  // The plugin only lets members attach a provider to an organization; admins attach it here.
  if (input.organizationId) {
    await db.update(ssoProvider).set({ organizationId: input.organizationId }).where(eq(ssoProvider.providerId, providerId));
    await audit({
      action: "sso_provider.update",
      target: { type: "sso_provider", id: providerId, label: providerId },
      metadata: { organizationId: input.organizationId },
    });
  }
  return { ok: true };
}

/**
 * Updates a SAML provider: domain and organization, attribute mapping, the signed-assertion
 * requirement and, when `idp` is given, the IdP (new metadata after a certificate rotation).
 * Changing the domain means verifying it again. Sign-ins in progress fail once the config
 * changes (the plugin binds each one to the provider's configuration).
 */
export async function updateSamlProvider(
  providerId: string,
  input: Omit<SamlProviderInput, "idp"> & { idp: SamlIdpFormInput | null; domain: string; organizationId: string | null },
): Promise<Result> {
  const { audit } = await adminActor();
  const [current] = await db.select().from(ssoProvider).where(eq(ssoProvider.providerId, providerId));
  if (!current?.samlConfig) return { ok: false, error: "Provider not found." };
  let stored: Record<string, unknown>;
  try {
    stored = JSON.parse(current.samlConfig) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "The stored SAML configuration is unreadable; delete and register the provider again." };
  }
  const domain = input.domain.trim().toLowerCase();
  if (!hostnameOf(domain) || domain.includes("/")) return { ok: false, error: "Enter an email domain, e.g. acme.com." };
  if (input.organizationId) {
    const [org] = await db.select({ id: organization.id }).from(organization).where(eq(organization.id, input.organizationId));
    if (!org) return { ok: false, error: "Organization not found." };
  }
  // Without new IdP input, re-validate the stored one so mapping and options go through the same checks.
  const storedIdp = stored.idpMetadata as { metadata?: string; entityID?: string; cert?: string } | undefined;
  const idpInput: SamlIdpFormInput =
    input.idp ??
    (storedIdp?.metadata
      ? { source: "xml", xml: storedIdp.metadata }
      : { source: "manual", entityId: storedIdp?.entityID ?? "", ssoUrl: String(stored.entryPoint ?? ""), certificate: storedIdp?.cert ?? "" });
  const built = await samlConfigFrom({ idp: idpInput, mapping: input.mapping, wantAssertionsSigned: input.wantAssertionsSigned });
  if (!built.ok) return built;
  const samlConfig = JSON.stringify({ ...built.config, issuer: current.issuer });
  const domainChanged = domain !== current.domain;
  await db
    .update(ssoProvider)
    .set({ samlConfig, domain, organizationId: input.organizationId, ...(domainChanged ? { domainVerified: false } : {}) })
    .where(eq(ssoProvider.providerId, providerId));
  if (domainChanged) await db.delete(verification).where(eq(verification.identifier, verificationIdentifier(providerId)));
  await audit({
    action: "sso_provider.update",
    target: { type: "sso_provider", id: providerId, label: providerId },
    metadata: {
      protocol: "saml",
      domain,
      organizationId: input.organizationId,
      domainVerificationReset: domainChanged,
      idpEntityId: built.idp.entityId,
      idpUpdated: input.idp !== null,
      wantAssertionsSigned: input.wantAssertionsSigned,
      mapping: built.config.mapping,
    },
  });
  return { ok: true };
}
