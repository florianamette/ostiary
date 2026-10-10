import { APIError, createAuthMiddleware } from "better-auth/api";
import { eq } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import * as schema from "@ostiary/core/db/schema";
import { recordAudit } from "@ostiary/core/lib/audit";
import { clientIp, recordAuthEvent } from "@ostiary/core/lib/auth-events";
import { markDynamicRegistration } from "@ostiary/core/lib/client-registration-policy";
import { PASSWORD_SIGN_IN_PATHS } from "@ostiary/core/lib/auth-hooks/sign-in-plugins";
import { type Bag, str } from "@ostiary/core/lib/auth-hooks/values";

type AuditTarget = "user" | "oauth_client" | "sso_provider" | "organization";
type Actor = { id: string; email: string };

/** The audit log's actor: only the account's id and email. */
export function auditActor(user: Actor | null | undefined): Actor | null {
    return user ? { id: user.id, email: user.email } : null;
}

/**
 * Better Auth admin endpoints that change something, mapped to an audit action and how to
 * find the target's id (from the request body, or from the response for created objects).
 */
const AUDITED_ENDPOINTS: Record<string, { action: string; target?: AuditTarget; id?: (body: Bag, res: Bag) => string | undefined }> = {
    "/admin/create-user": { action: "user.create", target: "user", id: (_b, r) => str((r.user as Bag | undefined)?.id) },
    "/admin/update-user": { action: "user.update", target: "user", id: (b) => str(b.userId) },
    "/admin/set-role": { action: "user.set_role", target: "user", id: (b) => str(b.userId) },
    "/admin/set-user-password": { action: "user.set_password", target: "user", id: (b) => str(b.userId) },
    "/admin/ban-user": { action: "user.ban", target: "user", id: (b) => str(b.userId) },
    "/admin/unban-user": { action: "user.unban", target: "user", id: (b) => str(b.userId) },
    "/admin/remove-user": { action: "user.delete", target: "user", id: (b) => str(b.userId) },
    "/admin/revoke-user-session": { action: "user.revoke_session" },
    "/admin/revoke-user-sessions": { action: "user.revoke_all_sessions", target: "user", id: (b) => str(b.userId) },
    "/admin/impersonate-user": { action: "user.impersonate", target: "user", id: (b) => str(b.userId) },
    "/oauth2/delete-client": { action: "oauth_client.delete", target: "oauth_client", id: (b) => str(b.client_id) },
    "/oauth2/client/rotate-secret": { action: "oauth_client.rotate_secret", target: "oauth_client", id: (b) => str(b.client_id) },
    "/oauth2/update-consent": { action: "oauth_consent.update" },
    "/oauth2/delete-consent": { action: "oauth_consent.delete" },
    "/device/approve": { action: "oauth_device.approve" },
    "/device/deny": { action: "oauth_device.deny" },
    "/sso/register": { action: "sso_provider.create", target: "sso_provider", id: (b) => str(b.providerId) },
    "/organization/create": { action: "organization.create", target: "organization", id: (_b, r) => str(r.id) },
};

/** Request fields that are never written to the audit log. */
const SECRET_FIELDS = new Set(["password", "newPassword", "sessionToken", "clientSecret", "client_secret", "oidcConfig", "samlConfig", "userCode"]);

/**
 * Records that a client came from /oauth2/register (`oauth_client.metadata`), which is how
 * the admin console and the consent screen tell it from an admin-registered one. If that
 * fails the client is deleted, so an unmarked client never passes for a reviewed one.
 */
async function markDynamicClient(returned: unknown, actor: Actor | null, ipAddress: string | null) {
    const created = (returned && typeof returned === "object" ? returned : {}) as Bag;
    const clientId = str(created.client_id);
    if (!clientId) return;
    try {
        const [row] = await db
            .select({ metadata: schema.oauthClient.metadata })
            .from(schema.oauthClient)
            .where(eq(schema.oauthClient.clientId, clientId));
        await db
            .update(schema.oauthClient)
            .set({ metadata: markDynamicRegistration(row?.metadata) })
            .where(eq(schema.oauthClient.clientId, clientId));
    } catch (error) {
        console.error("Could not mark a dynamically registered client; deleting it", error);
        await db.delete(schema.oauthClient).where(eq(schema.oauthClient.clientId, clientId)).catch(() => {});
        throw new APIError("INTERNAL_SERVER_ERROR", { error: "server_error", error_description: "Registration failed" });
    }
    await recordAudit({
        actor: auditActor(actor),
        action: "oauth_client.self_register",
        target: { type: "oauth_client", id: clientId, label: str(created.client_name) ?? null },
        metadata: { source: "dynamic", redirect_uris: created.redirect_uris, scope: created.scope },
        ipAddress,
    });
}

/**
 * After every request: counts failed password sign-ins, marks self-registered clients and
 * writes the audit log for the admin endpoints above.
 */
export function auditRequests() {
    return createAuthMiddleware(async (ctx) => {
        const returned = ctx.context.returned;
        const failed = returned instanceof Error;
        const body = (ctx.body ?? {}) as Bag;

        if (PASSWORD_SIGN_IN_PATHS.has(ctx.path) && failed) {
            const identifier = typeof body.email === "string" ? body.email : typeof body.username === "string" ? body.username : null;
            await recordAuthEvent("sign_in_failed", null, { identifier, ipAddress: clientIp(ctx.headers) });
            return;
        }

        if (ctx.path === "/oauth2/register" && !failed) {
            await markDynamicClient(returned, ctx.context.session?.user ?? null, clientIp(ctx.headers));
            return;
        }

        const audited = AUDITED_ENDPOINTS[ctx.path];
        if (!audited || failed) return;

        // An address set by an admin is unproven: the user must verify it at next sign-in.
        const changes = body.data as Bag | undefined;
        if (ctx.path === "/admin/update-user" && typeof body.userId === "string" && typeof changes?.email === "string") {
            await ctx.context.internalAdapter.updateUser(body.userId, { emailVerified: false });
        }
        const response = (returned && typeof returned === "object" ? returned : {}) as Bag;
        const targetId = audited.id?.(body, response);
        const metadata = Object.fromEntries(Object.entries(body).filter(([key]) => !SECRET_FIELDS.has(key)));
        await recordAudit({
            actor: auditActor(ctx.context.session?.user),
            action: audited.action,
            target: audited.target && targetId ? { type: audited.target, id: targetId } : undefined,
            metadata: Object.keys(metadata).length ? metadata : undefined,
            ipAddress: clientIp(ctx.headers),
        });
    });
}
