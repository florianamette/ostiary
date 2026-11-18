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
import {
  pruneNeverUsedSelfRegisteredClients,
  removeDuplicateSelfRegisteredClients,
} from "@ostiary/core/lib/client-dedupe";
import { MAX_UNUSED_CLIENT_DAYS } from "@ostiary/core/lib/client-dedupe-policy";
import { parseLogoUri } from "@ostiary/core/lib/admin/oauth-clients/oauth-client-admin.validation";
import { currentApiScopes, OIDC_SCOPES } from "@ostiary/core/lib/oauth-scopes";
import { z } from "zod";

import { adminAction, input, type AdminActor } from "@/lib/admin-action";
import type { ActionResult } from "@/lib/action-result";

/*
 * Self-registration settings and the clients registered that way. Those clients have no
 * owner, so Better Auth's client endpoints (scoped to the signed-in user) cannot change
 * them: these actions write the rows directly, and only ever self-registered ones.
 */

type ClientRegistrationInput = {
  dynamic: DynamicRegistrationMode;
  metadataDocuments: boolean;
  scopes: string[];
  /** One host per line or separated by commas. */
  metadataDocumentHosts: string;
  maxRegistrationsPerHour: number;
  reuseIdenticalPublicClients: boolean;
};

const registrationInput = z.tuple([
      z.object({
        // Checked by the action, which says which modes exist.
        dynamic: z.string().max(64).transform((mode) => mode as DynamicRegistrationMode),
        metadataDocuments: z.boolean(),
        scopes: z.array(z.string().max(256)).max(1000),
        metadataDocumentHosts: input.longText,
        maxRegistrationsPerHour: z.number(),
        reuseIdenticalPublicClients: z.boolean(),
      }),
    ]);

export async function updateClientRegistration(input: ClientRegistrationInput): Promise<ActionResult> {
  return adminAction(registrationInput, [input], ([input], actor) => updateClientRegistrationRun(input, actor));
}

async function updateClientRegistrationRun(input: ClientRegistrationInput, actor: AdminActor): Promise<ActionResult> {
  const { session, audit } = actor;
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
    reuseIdenticalPublicClients: input.reuseIdenticalPublicClients,
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

const disabledInput = z.tuple([input.id, z.boolean()]);

export async function setSelfRegisteredClientDisabled(clientId: string, disabled: boolean): Promise<ActionResult> {
  return adminAction(disabledInput, [clientId, disabled], ([clientId, disabled], actor) => setSelfRegisteredClientDisabledRun(clientId, disabled, actor));
}

async function setSelfRegisteredClientDisabledRun(clientId: string, disabled: boolean, actor: AdminActor): Promise<ActionResult> {
  const { audit } = actor;
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

const iconInput = z.tuple([input.id, input.text]);

/**
 * Sets or clears (empty) the icon of a dynamically registered client. A metadata document
 * client's icon comes from its document, which replaces it on every refresh.
 */
export async function setSelfRegisteredClientIcon(clientId: string, logoUri: string): Promise<ActionResult> {
  return adminAction(iconInput, [clientId, logoUri], ([clientId, logoUri], actor) => setSelfRegisteredClientIconRun(clientId, logoUri, actor));
}

async function setSelfRegisteredClientIconRun(clientId: string, logoUri: string, actor: AdminActor): Promise<ActionResult> {
  const { audit } = actor;
  const client = await selfRegisteredClient(clientId);
  if (!client.ok) return client;
  const t = await getTranslations("admin.pages.applications.actions.registration");
  if (client.source !== "dynamic") return { ok: false, error: t("iconFromMetadataDocument") };
  const parsed = parseLogoUri(logoUri);
  if (!parsed.ok) return { ok: false, error: t("invalidIconUrl") };
  await db
    .update(oauthClient)
    .set({ icon: parsed.value, updatedAt: new Date() })
    .where(eq(oauthClient.clientId, clientId));
  await audit({
    action: "oauth_client.update",
    target: { type: "oauth_client", id: clientId, label: client.name },
    metadata: { fields: ["logo_uri"], source: client.source },
  });
  return { ok: true };
}

const clientInput = z.tuple([input.id]);

export async function deleteSelfRegisteredClient(clientId: string): Promise<ActionResult> {
  return adminAction(clientInput, [clientId], ([clientId], actor) => deleteSelfRegisteredClientRun(clientId, actor));
}

async function deleteSelfRegisteredClientRun(clientId: string, actor: AdminActor): Promise<ActionResult> {
  const { audit } = actor;
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

/**
 * Removes duplicate self-registered public clients (client-dedupe.ts): keeps the most recently
 * used of each group, deletes the others unless they still hold live tokens. With
 * `neverUsedDays`, also deletes self-registered clients never used and older than that.
 */
export async function removeUnusedDuplicateClients(
  neverUsedDays: number | null,
): Promise<ActionResult<{ removed: number; inUse: number }>> {
  return adminAction(z.tuple([z.number().nullable()]), [neverUsedDays], ([days], actor) => removeUnusedDuplicateClientsRun(days, actor));
}

async function removeUnusedDuplicateClientsRun(
  neverUsedDays: number | null,
  { audit }: AdminActor,
): Promise<ActionResult<{ removed: number; inUse: number }>> {
  const t = await getTranslations("admin.pages.applications.actions.registration");
  if (neverUsedDays !== null && (!Number.isInteger(neverUsedDays) || neverUsedDays < 1 || neverUsedDays > MAX_UNUSED_CLIENT_DAYS)) {
    return { ok: false, error: t("invalidUnusedDays", { max: String(MAX_UNUSED_CLIENT_DAYS) }) };
  }
  try {
    const report = await removeDuplicateSelfRegisteredClients();
    const pruned = neverUsedDays === null ? [] : await pruneNeverUsedSelfRegisteredClients(neverUsedDays);
    await audit({
      action: "oauth_client.remove_duplicates",
      metadata: {
        groups: report.groups.map((group) => ({ name: group.name, kept: group.kept, removed: group.removed, inUse: group.inUse })),
        neverUsedDays,
        pruned,
      },
    });
    return { ok: true, removed: report.removed + pruned.length, inUse: report.inUse };
  } catch (error) {
    console.error("Could not remove duplicate clients", error);
    return { ok: false, error: t("cleanupFailed") };
  }
}
