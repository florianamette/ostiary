"use server";

import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { db } from "@ostiary/core/db/index";
import { member, organization, session } from "@ostiary/core/db/schema";
import { PUBLIC_ORGANIZATION_ID } from "@ostiary/core/lib/organization-public";
import { makeEvent, memberSnapshot } from "@ostiary/core/lib/webhooks/events";
import { enqueueWebhookEvents } from "@ostiary/core/lib/webhooks/outbox";
import { adminAction, input } from "@/lib/admin-action";
import type { ActionResult } from "@/lib/action-result";

/**
 * Deletes an organization with its memberships and invitations (cascading foreign keys).
 * Better Auth only lets an organization's owner delete it, so platform admins go through
 * the database here. Sessions that had it active fall back to the Public workspace. Each
 * membership removed this way is an `organization.member.removed` webhook event.
 */
export async function deleteOrganization(id: string): Promise<ActionResult> {
  return adminAction(z.tuple([input.id]), [id], async ([id], { audit }) => {
    const t = await getTranslations("admin.pages.organizations.errors");
    if (id === PUBLIC_ORGANIZATION_ID) return { ok: false, error: t("publicDelete") };
    const [org] = await db.select({ name: organization.name }).from(organization).where(eq(organization.id, id));
    if (!org) return { ok: false, error: t("organizationNotFound") };

    await db.transaction(async (tx) => {
      const removed = await tx.select().from(member).where(eq(member.organizationId, id));
      await tx
        .update(session)
        .set({ activeOrganizationId: PUBLIC_ORGANIZATION_ID })
        .where(eq(session.activeOrganizationId, id));
      await tx.delete(organization).where(eq(organization.id, id));
      await enqueueWebhookEvents(tx, removed.map((row) => makeEvent("organization.member.removed", { member: memberSnapshot(row) })));
    });
    await audit({ action: "organization.delete", target: { type: "organization", id, label: org.name } });
    return { ok: true };
  });
}
