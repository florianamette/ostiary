"use server";

import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { db } from "@ostiary/core/db/index";
import { oauthClient } from "@ostiary/core/db/schema";
import {
  clientRegistrationSource,
  restrictSelfRegisteredScopes,
  saveClientRegistrationSettings,
} from "@ostiary/core/lib/client-registration";
import {
  DYNAMIC_REGISTRATION_MODES,
  MAX_REGISTRATIONS_PER_HOUR_LIMIT,
  normalizeHost,
  type ClientRegistrationSettings,
  type DynamicRegistrationMode,
} from "@ostiary/core/lib/client-registration-policy";
import { currentApiScopes, OIDC_SCOPES } from "@ostiary/core/lib/oauth-scopes";
import { adminActor } from "@/lib/admin-audit";

/*
 * Self-registration settings and the clients registered that way. Those clients have no
 * owner, so Better Auth's client endpoints (scoped to the signed-in user) cannot change
 * them: these actions write the rows directly, and only ever self-registered ones.
 */

type Result = { ok: true } | { ok: false; error: string };

export type ClientRegistrationInput = {
  dynamic: DynamicRegistrationMode;
  metadataDocuments: boolean;
  scopes: string[];
  /** One host per line or separated by commas. */
  metadataDocumentHosts: string;
  maxRegistrationsPerHour: number;
};

export async function updateClientRegistration(input: ClientRegistrationInput): Promise<Result> {
  const { session, audit } = await adminActor();
  const t = await getTranslations("admin.pages.applications.actions.registration");
  if (!(DYNAMIC_REGISTRATION_MODES as readonly string[]).includes(input.dynamic)) {
    return { ok: false, error: t("chooseMode") };
  }
  const available = new Set<string>([...OIDC_SCOPES, ...(await currentApiScopes())]);
  const scopes = [...new Set(input.scopes)];
  const unknown = scopes.find((scope) => !available.has(scope));
  if (unknown) return { ok: false, error: t("unknownScope", { scope: unknown }) };
  if (scopes.length === 0) return { ok: false, error: t("noScopes") };

  const hosts: string[] = [];
  for (const raw of input.metadataDocumentHosts.split(/[\s,]+/).filter(Boolean)) {
    const host = normalizeHost(raw);
    if (!host) return { ok: false, error: t("invalidHost", { raw, example: "claude.ai" }) };
    hosts.push(host);
  }
  const max = input.maxRegistrationsPerHour;
  if (!Number.isInteger(max) || max < 0 || max > MAX_REGISTRATIONS_PER_HOUR_LIMIT) {
    return { ok: false, error: t("invalidLimit", { max: String(MAX_REGISTRATIONS_PER_HOUR_LIMIT) }) };
  }

  const settings: ClientRegistrationSettings = {
    dynamic: input.dynamic,
    metadataDocuments: input.metadataDocuments,
    scopes,
    metadataDocumentHosts: [...new Set(hosts)],
    maxRegistrationsPerHour: max,
  };
  let narrowed: number;
  try {
    await saveClientRegistrationSettings(settings, session.user.id);
    // Narrowing the scopes also narrows clients registered before.
    narrowed = await restrictSelfRegisteredScopes(scopes);
  } catch (error) {
    console.error("Could not save the client registration settings", error);
    return { ok: false, error: t("saveFailed") };
  }
  await audit({
    action: "client_registration.update",
    metadata: { ...settings, narrowedClients: narrowed },
  });
  return { ok: true };
}

/** Loads a client and checks it was self-registered (admin-registered ones are not managed here). */
async function selfRegisteredClient(clientId: string) {
  const t = await getTranslations("admin.pages.applications.actions.registration");
  const source = await clientRegistrationSource(clientId);
  if (source === null) return { ok: false as const, error: t("clientGone") };
  if (source === "admin") return { ok: false as const, error: t("notSelfRegistered") };
  const [row] = await db
    .select({ name: oauthClient.name })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId));
  return { ok: true as const, source, name: row?.name ?? null };
}

export async function setSelfRegisteredClientDisabled(clientId: string, disabled: boolean): Promise<Result> {
  const { audit } = await adminActor();
  const client = await selfRegisteredClient(clientId);
  if (!client.ok) return client;
  // Better Auth refuses disabled clients at authorization, token and introspection.
  await db
    .update(oauthClient)
    .set({ disabled, updatedAt: new Date() })
    .where(eq(oauthClient.clientId, clientId));
  await audit({
    action: disabled ? "oauth_client.disable" : "oauth_client.enable",
    target: { type: "oauth_client", id: clientId, label: client.name },
    metadata: { source: client.source },
  });
  return { ok: true };
}

export async function deleteSelfRegisteredClient(clientId: string): Promise<Result> {
  const { audit } = await adminActor();
  const client = await selfRegisteredClient(clientId);
  if (!client.ok) return client;
  // Its tokens and consents go with it (foreign keys cascade).
  await db.delete(oauthClient).where(eq(oauthClient.clientId, clientId));
  await audit({
    action: "oauth_client.delete",
    target: { type: "oauth_client", id: clientId, label: client.name },
    metadata: { source: client.source },
  });
  return { ok: true };
}
