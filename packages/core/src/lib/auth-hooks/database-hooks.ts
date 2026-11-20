import type { BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import { and, eq } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import * as schema from "@ostiary/core/db/schema";
import { recordAudit } from "@ostiary/core/lib/audit";
import { clientIp, recordAuthEvent } from "@ostiary/core/lib/auth-events";
import { adminOnSignUp, adminOnVerification, fromIdentityProvider, parseAdminEmails } from "@ostiary/core/lib/admin/admin-emails";
import { emailAliasTaken } from "@ostiary/core/lib/security/email-aliases";
import { revokeUserAccess } from "@ostiary/core/lib/security/user-access-revocation";
import { isExternalSignInPath } from "@ostiary/core/lib/security/external-sign-in";
import { PUBLIC_ORGANIZATION_ID } from "@ostiary/core/lib/organization-public";
import { joinPublicOrganization } from "@ostiary/core/lib/public-organization-membership";
import { env } from "@ostiary/core/lib/env";
import { completeUserErasure, prepareUserErasure, type ErasurePlan } from "@ostiary/core/lib/account-data/erasure";
import { emitWebhookEvents } from "@ostiary/core/lib/webhooks/outbox";
import { makeEvent, memberSnapshot } from "@ostiary/core/lib/webhooks/events";
import { auditActor } from "@ostiary/core/lib/auth-hooks/audit-hook";
import { TWO_STEP_SIGN_IN_PATHS } from "@ostiary/core/lib/auth-hooks/sign-in-plugins";

/** First-run setup: these addresses get the admin role once proven, see admin/admin-emails.ts. */
const adminEmails = parseAdminEmails(env.ADMIN_EMAILS);

/**
 * Erasure plans of accounts being deleted, read before the delete (see account-data/erasure.ts)
 * and carried out once it is done. Keyed by account id. A plan whose delete failed is never
 * picked up: it is dropped after PLAN_TTL_MS so the map cannot grow.
 */
const pendingErasures = new Map<string, { plan: ErasurePlan; at: number }>();
const PLAN_TTL_MS = 10 * 60_000;

function rememberErasure(userId: string, plan: ErasurePlan) {
    const now = Date.now();
    for (const [id, entry] of pendingErasures) {
        if (now - entry.at > PLAN_TTL_MS) pendingErasures.delete(id);
    }
    pendingErasures.set(userId, { plan, at: now });
}

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
 * EMAIL_DEDUP: a self-service account whose address reaches an existing account's inbox
 * (john.doe@gmail.com and johndoe+x@gmail.com) is refused. A 403 here makes a password sign-up
 * answer as it does for a taken address, without saying so. Accounts an admin, an SSO provider
 * or SCIM creates, and server calls without a request, are not checked.
 */
async function refuseEmailAlias(email: string, path: string | undefined) {
    if (!path || path.startsWith("/admin/") || fromIdentityProvider(path)) return;
    if (!(await emailAliasTaken(db, email, env.EMAIL_DEDUP))) return;
    throw new APIError("FORBIDDEN", { message: "An account already uses this email address.", code: "EMAIL_ALIAS_TAKEN" });
}

/** Better Auth's database hooks: admin promotion, the Public organization, bans, deletions and sign-in events. */
export function databaseHooks() {
    return {
        user: {
            create: {
                before: async (newUser, context) => {
                    await refuseEmailAlias(newUser.email, context?.path);
                    // Only with an address the provider verified, never through SSO or SCIM. A
                    // password sign-up is promoted when its address is verified (update hook).
                    if (!adminOnSignUp(newUser, context?.path, adminEmails)) return;
                    return { data: { ...newUser, role: "admin" } };
                },
                after: async (createdUser) => {
                    await joinPublicOrganization(db, [createdUser.id]);
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
                    // Apps lose access too: refresh tokens stop working, as with SCIM deactivation.
                    await revokeUserAccess(updatedUser, "banned", auditActor(context?.context.session?.user), ipAddress);
                },
            },
            // Every deletion (the person, an admin): erase what foreign keys leave behind
            // (account-data/erasure.ts), then tell apps about the memberships that went with it.
            // Erasure happens after the delete, so a delete that fails erases nothing.
            delete: {
                before: async (deletedUser) => {
                    rememberErasure(deletedUser.id, await prepareUserErasure(db, deletedUser));
                },
                after: async (deletedUser) => {
                    const pending = pendingErasures.get(deletedUser.id);
                    pendingErasures.delete(deletedUser.id);
                    const plan = pending?.plan ?? (await prepareUserErasure(db, deletedUser));
                    const { memberships } = await completeUserErasure(db, deletedUser, plan);
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
