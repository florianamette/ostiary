"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { db } from "@ostiary/core/db/index";
import { ssoProvider } from "@ostiary/core/db/schema";
import { betterAuthErrorMessage } from "@ostiary/core/lib/api/better-auth-error";
import { env } from "@ostiary/core/lib/env";
import {
  buildSamlConfig,
  SAML_PROVIDER_ID_PATTERN,
  samlServiceProviderUrls,
  type SamlErrorCode,
  type SamlMapping,
} from "@ostiary/core/lib/saml";
import { fetchSamlMetadata } from "@ostiary/core/lib/saml-metadata-fetch";
import { parseSsoDomain } from "@ostiary/core/lib/security/sso-domain";
import { adminAction, input } from "@/lib/admin-action";
import { applySsoProviderChange, checkSsoProviderTarget, isDomainTakenViolation } from "@/lib/sso-provider-change";
import { auth } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";

/*
 * SAML providers. Registration goes through the plugin's /sso/register (with the admin's
 * session), so it gets the plugin's own checks and the audit entry every registration gets
 * (`sso_provider.create`, written by the auth after-hook without the samlConfig). Before that,
 * Ostiary validates the IdP side (lib/saml.ts) and builds the samlConfig: SP entity ID and ACS
 * derived from AUTH_APP_URL, AuthnRequests unsigned, signed assertions required unless the
 * admin turns it off (a signed response is still required then: samlify refuses unsigned ones).
 */

export type SamlIdpFormInput =
  | { source: "xml"; xml: string }
  | { source: "url"; url: string }
  | { source: "manual"; entityId: string; ssoUrl: string; certificate: string };

type SamlProviderInput = {
  idp: SamlIdpFormInput;
  mapping: SamlMapping;
  wantAssertionsSigned: boolean;
};



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

const errors = () => getTranslations("sso.errors");

/** A refused IdP input, in the admin's language when lib/saml or url-safety gave a code (else as is). */
async function samlFailure(failure: {
  error: string;
  code?: SamlErrorCode;
  urlCode?: string;
  values?: Record<string, string | number>;
}): Promise<ActionResult> {
  if (failure.code) return { ok: false, error: (await getTranslations("sso.saml.errors"))(failure.code, failure.values) };
  if (failure.urlCode) return { ok: false, error: (await getTranslations("admin.urlCheck"))(failure.urlCode, failure.values) };
  return { ok: false, error: failure.error };
}

const idpInput = z.discriminatedUnion("source", [
  z.object({ source: z.literal("xml"), xml: input.longText }),
  z.object({ source: z.literal("url"), url: input.text }),
  z.object({ source: z.literal("manual"), entityId: input.text, ssoUrl: input.text, certificate: input.longText }),
]);
const attribute = z.string().max(1000);
const mappingInput = z.object({ email: attribute, name: attribute, firstName: attribute.optional(), lastName: attribute.optional() });
const providerFields = {
  mapping: mappingInput,
  wantAssertionsSigned: z.boolean(),
  domain: input.text,
  organizationId: input.id.nullable(),
};
const registerInput = z.tuple([z.object({ ...providerFields, idp: idpInput, providerId: input.text })]);
const updateInput = z.tuple([input.id, z.object({ ...providerFields, idp: idpInput.nullable() })]);

export async function registerSamlProvider(
  raw: SamlProviderInput & { providerId: string; domain: string; organizationId: string | null },
): Promise<ActionResult> {
  return adminAction(registerInput, [raw], async ([parsed], { audit }) => {
  const input = parsed;
  if (!env.AUTH_APP_URL) return { ok: false, error: (await errors())("envNotSet", { name: "AUTH_APP_URL" }) };
  const providerId = input.providerId.trim();
  if (!SAML_PROVIDER_ID_PATTERN.test(providerId)) {
    return { ok: false, error: (await errors())("invalidProviderId") };
  }
  const domain = parseSsoDomain(input.domain);
  if (!domain) return { ok: false, error: (await errors())("invalidDomain") };
  const refused = await checkSsoProviderTarget(db, { domain, organizationId: input.organizationId });
  if (refused) return { ok: false, error: (await errors())(refused) };
  const built = await samlConfigFrom(input);
  if (!built.ok) return samlFailure(built);
  const sp = samlServiceProviderUrls(env.AUTH_APP_URL, providerId);
  try {
    await auth.api.registerSSOProvider({
      headers: await headers(),
      body: { providerId, issuer: sp.entityId, domain, samlConfig: built.config },
    });
  } catch (error) {
    // Another provider took the domain since the check above (unique index on lower(domain)).
    if (isDomainTakenViolation(error)) return { ok: false, error: (await errors())("domainTaken") };
    return { ok: false, error: betterAuthErrorMessage(error, (await getTranslations("sso"))("registerError")) };
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
  });
}

/**
 * Updates a SAML provider: domain and organization, attribute mapping, the signed-assertion
 * requirement and, when `idp` is given, the IdP (new metadata after a certificate rotation).
 * Changing the domain means verifying it again. Sign-ins in progress fail once the config
 * changes (the plugin binds each one to the provider's configuration).
 */
export async function updateSamlProvider(
  rawProviderId: string,
  raw: Omit<SamlProviderInput, "idp"> & { idp: SamlIdpFormInput | null; domain: string; organizationId: string | null },
): Promise<ActionResult> {
  return adminAction(updateInput, [rawProviderId, raw], async ([providerId, parsed], { audit }) => {
  const input = parsed;
  const [current] = await db.select().from(ssoProvider).where(eq(ssoProvider.providerId, providerId));
  if (!current?.samlConfig) return { ok: false, error: (await errors())("providerNotFound") };
  let stored: Record<string, unknown>;
  try {
    stored = JSON.parse(current.samlConfig) as Record<string, unknown>;
  } catch {
    return { ok: false, error: (await errors())("unreadableSamlConfig") };
  }
  const domain = parseSsoDomain(input.domain);
  if (!domain) return { ok: false, error: (await errors())("invalidDomain") };
  // Without new IdP input, re-validate the stored one so mapping and options go through the same checks.
  const storedIdp = stored.idpMetadata as { metadata?: string; entityID?: string; cert?: string } | undefined;
  const idpInput: SamlIdpFormInput =
    input.idp ??
    (storedIdp?.metadata
      ? { source: "xml", xml: storedIdp.metadata }
      : { source: "manual", entityId: storedIdp?.entityID ?? "", ssoUrl: String(stored.entryPoint ?? ""), certificate: storedIdp?.cert ?? "" });
  const built = await samlConfigFrom({ idp: idpInput, mapping: input.mapping, wantAssertionsSigned: input.wantAssertionsSigned });
  if (!built.ok) return samlFailure(built);
  const samlConfig = JSON.stringify({ ...built.config, issuer: current.issuer });
  const saved = await applySsoProviderChange(current, { domain, organizationId: input.organizationId, extra: { samlConfig } });
  if (!saved.ok) return { ok: false, error: (await errors())(saved.error) };
  const domainChanged = saved.domainChanged;
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
  });
}
