"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { db } from "@ostiary/core/db/index";
import { organization } from "@ostiary/core/db/schema";
import { betterAuthErrorMessage } from "@ostiary/core/lib/api/better-auth-error";
import { organizationAcceptsScim, SCIM_TOKEN_LIFETIME_MS, SCIM_TOKEN_SCOPES } from "@ostiary/core/lib/scim";
import { adminAction, input, type AdminActor } from "@/lib/admin-action";
import { auth } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";

/*
 * SCIM tokens go through the plugin's server-only endpoints (no HTTP route), so the admin
 * check below is the only way in. An organization has one connection; a new token replaces
 * the previous ones at once, and revoking stops provisioning without touching any account.
 */

const errors = () => getTranslations("admin.pages.organizations.errors");

async function message(error: unknown): Promise<string> {
  if (!(error && typeof error === "object" && "body" in error)) console.error("[scim] token change failed", error);
  return betterAuthErrorMessage(error, (await errors())("requestFailed"));
}

const orgInput = z.tuple([input.id]);

async function scimOrganization(orgId: string) {
  if (!organizationAcceptsScim(orgId)) return null;
  const [org] = await db.select({ id: organization.id, name: organization.name }).from(organization).where(eq(organization.id, orgId));
  return org ?? null;
}

async function activeConnection(orgId: string) {
  const { connections } = await auth.api.listSCIMManagedConnections({ body: { provisioningDomainId: orgId } });
  const connection = connections.find((c) => c.status === "active");
  if (!connection) return null;
  const state = await auth.api.getSCIMManagedConnection({
    body: { connectionId: connection.connectionId, provisioningDomainId: orgId },
  });
  return { connectionId: connection.connectionId, credentials: state.credentials.filter((c) => c.status === "active") };
}

/** Issues a token (creating the connection the first time). Previous tokens stop working. */
export async function generateScimToken(orgId: string): Promise<ActionResult<{ token: string; expiresAt: string }>> {
  return adminAction(orgInput, [orgId], ([orgId], actor) => issueScimToken(orgId, actor));
}

async function issueScimToken(
  orgId: string,
  { audit, session }: AdminActor,
): Promise<ActionResult<{ token: string; expiresAt: string }>> {
  const org = await scimOrganization(orgId);
  if (!org) return { ok: false, error: (await errors())("scimUnavailable") };
  const policy = { scopes: SCIM_TOKEN_SCOPES, expiresAt: new Date(Date.now() + SCIM_TOKEN_LIFETIME_MS), actorId: session.user.id };
  try {
    const existing = await activeConnection(orgId);
    if (!existing) {
      const created = await auth.api.createSCIMManagedConnection({
        body: { ...policy, creationRequestId: `ostiary_${randomUUID()}`, provisioningDomainId: orgId },
      });
      await audit({
        action: "scim.token_create",
        target: { type: "organization", id: orgId, label: org.name },
        metadata: { credentialId: created.credential.credentialId, expiresAt: policy.expiresAt.toISOString() },
      });
      return { ok: true, token: created.token, expiresAt: policy.expiresAt.toISOString() };
    }
    const rotated = await auth.api.rotateSCIMManagedCredential({
      body: { ...policy, connectionId: existing.connectionId, provisioningDomainId: orgId },
    });
    for (const credential of existing.credentials) {
      await auth.api.revokeSCIMManagedCredential({
        body: { connectionId: existing.connectionId, provisioningDomainId: orgId, credentialId: credential.credentialId, actorId: session.user.id },
      });
    }
    await audit({
      action: "scim.token_rotate",
      target: { type: "organization", id: orgId, label: org.name },
      metadata: {
        credentialId: rotated.credential.credentialId,
        revoked: existing.credentials.map((c) => c.credentialId),
        expiresAt: policy.expiresAt.toISOString(),
      },
    });
    return { ok: true, token: rotated.token, expiresAt: policy.expiresAt.toISOString() };
  } catch (error) {
    return { ok: false, error: await message(error) };
  }
}

/** Revokes every token: the identity provider can no longer provision. Accounts stay as they are. */
export async function revokeScimTokens(orgId: string): Promise<ActionResult> {
  return adminAction(orgInput, [orgId], ([orgId], actor) => revokeAllScimTokens(orgId, actor));
}

async function revokeAllScimTokens(
  orgId: string,
  { audit, session }: AdminActor,
): Promise<ActionResult> {
  const org = await scimOrganization(orgId);
  if (!org) return { ok: false, error: (await errors())("scimUnavailable") };
  try {
    const existing = await activeConnection(orgId);
    if (!existing?.credentials.length) return { ok: false, error: (await errors())("noActiveToken") };
    for (const credential of existing.credentials) {
      await auth.api.revokeSCIMManagedCredential({
        body: { connectionId: existing.connectionId, provisioningDomainId: orgId, credentialId: credential.credentialId, actorId: session.user.id },
      });
    }
    await audit({
      action: "scim.token_revoke",
      target: { type: "organization", id: orgId, label: org.name },
      metadata: { revoked: existing.credentials.map((c) => c.credentialId) },
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: await message(error) };
  }
}
