import { randomUUID } from "node:crypto";
import type { BetterAuthOptions } from "better-auth";
import { and, eq } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import * as schema from "@ostiary/core/db/schema";
import { recordAudit } from "@ostiary/core/lib/audit";
import { clientIp, recordAuthEvent } from "@ostiary/core/lib/auth-events";
import { adminOnSignUp, adminOnVerification, parseAdminEmails } from "@ostiary/core/lib/admin/admin-emails";
import { revokeUserOAuthTokens } from "@ostiary/core/lib/security/oauth-token-revocation";
import { isExternalSignInPath } from "@ostiary/core/lib/security/external-sign-in";
import { PUBLIC_ORGANIZATION_ID } from "@ostiary/core/lib/organization-public";
import { env } from "@ostiary/core/lib/env";
import { deleteUserApiKeys } from "@ostiary/core/lib/api-keys";
import { prepareUserErasure, type ErasureSummary } from "@ostiary/core/lib/account-data/erasure";
import { emitWebhookEvents } from "@ostiary/core/lib/webhooks/outbox";
import { makeEvent, memberSnapshot } from "@ostiary/core/lib/webhooks/events";
import { auditActor } from "@ostiary/core/lib/auth-hooks/audit-hook";
import { TWO_STEP_SIGN_IN_PATHS } from "@ostiary/core/lib/auth-hooks/sign-in-plugins";

/** First-run setup: these addresses get the admin role once proven, see admin/admin-emails.ts. */
const adminEmails = parseAdminEmails(env.ADMIN_EMAILS);

/**
 * Memberships of accounts being deleted, read before the delete (the foreign key removes them)
 * and sent as `organization.member.removed` once it is done. Keyed by account id.
 */
const pendingErasures = new Map<string, ErasureSummary["memberships"]>();

/** Gives the admin role to an ADMIN_EMAILS account that has just proven its address. */
async function promoteVerifiedAdmin(user: { id: string; email: string }, ipAddress: string | null) {
    const promoted = await db
        .update(schema.user)
        .set({ role: "admin", updatedAt: new Date() })
        .where(and(eq(schema.user.id, user.id), eq(schema.user.emailVerified, true)))
        .returning({ id: schema.user.id });
    if (promoted.length === 0) return;
    await recordAudit({
        actor: null,
        action: "user.set_role",
        target: { type: "user", id: user.id, label: user.email },
        metadata: { role: "admin", reason: "ADMIN_EMAILS, address verified" },
        ipAddress,
    });
}

/**
 * Ends the OAuth access and refresh tokens apps hold for an account. Sessions are deleted by
 * Better Auth itself (ban, password reset); a ban also deletes API keys (user update hook).
 */
export async function revokeAppAccess(
    user: { id: string; email: string },
    reason: "banned" | "password_reset",
    actor: { id: string; email: string } | null,
    ipAddress: string | null,
) {
    const tokens = await revokeUserOAuthTokens(db, user.id);
    if (tokens.accessTokens + tokens.refreshTokens > 0) {
        await recordAudit({
            actor,
            action: "oauth_token.revoke_all",
            target: { type: "user", id: user.id, label: user.email },
            metadata: { reason, ...tokens },
            ipAddress,
        });
    }
}

/** Better Auth's database hooks: admin promotion, the Public organization, bans, deletions and sign-in events. */
export function databaseHooks() {
    return {
        user: {
            create: {
                before: async (newUser, context) => {
                    // Only with an address the provider verified, never through SSO or SCIM. A
                    // password sign-up is promoted when its address is verified (update hook).
                    if (!adminOnSignUp(newUser, context?.path, adminEmails)) return;
                    return { data: { ...newUser, role: "admin" } };
                },
                after: async (createdUser) => {
                    await db
                        .insert(schema.member)
                        .values({
                            id: randomUUID(),
                            organizationId: PUBLIC_ORGANIZATION_ID,
                            userId: createdUser.id,
                            role: "member",
                            createdAt: new Date(),
                        })
                        .onConflictDoNothing({
                            target: [
                                schema.member.userId,
                                schema.member.organizationId,
                            ],
                        });
                    await recordAuthEvent("sign_up", createdUser.id);
                },
            },
            update: {
                // A banned account loses its API keys (admin ban; a ban written elsewhere, such
                // as SCIM deactivation, is also refused at verification). Deleting an account
                // deletes its keys with it (foreign key).
                after: async (updatedUser, context) => {
                    const ipAddress = context ? clientIp(context.headers) : null;
                    const role = (updatedUser as { role?: string | null }).role;
                    if (adminOnVerification({ ...updatedUser, role }, context?.path, adminEmails)) {
                        await promoteVerifiedAdmin(updatedUser, ipAddress);
                    }
                    if (!updatedUser.banned) return;
                    const actor = auditActor(context?.context.session?.user);
                    // Apps lose access too: refresh tokens stop working, as with SCIM deactivation.
                    await revokeAppAccess(updatedUser, "banned", actor, ipAddress);
                    const revoked = await deleteUserApiKeys(updatedUser.id);
                    if (revoked === 0) return;
                    await recordAudit({
                        actor,
                        action: "api_key.revoke_all",
                        target: { type: "user", id: updatedUser.id, label: updatedUser.email },
                        metadata: { reason: "banned", keys: revoked },
                        ipAddress,
                    });
                },
            },
            // Every deletion (the person, an admin): erase what foreign keys leave behind
            // (account-data/erasure.ts), then tell apps about the memberships that went with it.
            delete: {
                before: async (deletedUser) => {
                    const summary = await prepareUserErasure(db, deletedUser);
                    pendingErasures.set(deletedUser.id, summary.memberships);
                },
                after: async (deletedUser) => {
                    const memberships = pendingErasures.get(deletedUser.id) ?? [];
                    pendingErasures.delete(deletedUser.id);
                    // Nobody is told about joining the default Public workspace either.
                    const removed = memberships.filter((m) => m.organizationId !== PUBLIC_ORGANIZATION_ID);
                    await emitWebhookEvents(
                        removed.map((m) => makeEvent("organization.member.removed", { member: memberSnapshot(m) })),
                    );
                },
            },
        },
        session: {
            create: {
                before: async (sess) => {
                    if (sess.activeOrganizationId) return;
                    return {
                        data: {
                            ...sess,
                            activeOrganizationId: PUBLIC_ORGANIZATION_ID,
                        },
                    };
                },
                // Every new session is a sign-in, whatever the method (password, passkey, SSO, OAuth).
                after: async (createdSession, ctx) => {
                    // Password, code and external sign-ins are counted by passwordSignInEvents, after the 2FA check.
                    if (ctx && (TWO_STEP_SIGN_IN_PATHS.has(ctx.path) || isExternalSignInPath(ctx.path))) return;
                    // Turning 2FA on or off replaces the current session: not a new sign-in.
                    if (ctx?.path.startsWith("/two-factor/") && ctx.context.session) return;
                    await recordAuthEvent("sign_in", createdSession.userId);
                },
            },
        },
    } satisfies BetterAuthOptions["databaseHooks"];
}
