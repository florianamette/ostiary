import { randomUUID } from "node:crypto";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, getOAuthState, getSessionFromCtx } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { apiKey } from "@better-auth/api-key";
import { createCimdClientDiscovery } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { oauthDeviceAuthorization, oauthProvider } from "@better-auth/oauth-provider";
import { and, eq } from "drizzle-orm";
import { passkey } from "@better-auth/passkey";
import { scim } from "@better-auth/scim";
import { sso } from "@better-auth/sso";
import {
    admin,
    captcha,
    emailOTP,
    haveIBeenPwned,
    jwt,
    type JwtOptions,
    lastLoginMethod,
    multiSession,
    oneTap,
    organization,
    username,
} from "better-auth/plugins";
import { twoFactor } from "better-auth/plugins/two-factor";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultRoles as platformRoles } from "better-auth/plugins/admin/access";
import { adminAc, defaultStatements, memberAc, ownerAc } from "better-auth/plugins/organization/access";

import { db } from "@ostiary/core/db/index";
import * as schema from "@ostiary/core/db/schema";
import { queueOrganizationInviteEmail } from "@ostiary/core/lib/email/queue-organization-invite-email";
import { queueChangeEmailConfirmation } from "@ostiary/core/lib/email/queue-change-email-confirmation";
import { queuePasswordResetEmail } from "@ostiary/core/lib/email/queue-password-reset-email";
import { queueVerificationEmail } from "@ostiary/core/lib/email/queue-verification-email";
import { queueSignInCodeEmail } from "@ostiary/core/lib/email/queue-sign-in-code-email";
import { SIGN_IN_CODE_LENGTH, SIGN_IN_CODE_MINUTES } from "@ostiary/core/lib/sign-in-code";
import { emailLocale } from "@ostiary/core/lib/email/email-locale";
import { captchaPluginOptions } from "@ostiary/core/lib/captcha";
import { routing } from "@ostiary/core/i18n/routing";
import { recordAudit } from "@ostiary/core/lib/audit";
import { clientIp, recordAuthEvent } from "@ostiary/core/lib/auth-events";
import { adminNeedsTwoFactor } from "@ostiary/core/lib/admin/admin-two-factor";
import { MAX_DEVICE_SESSIONS } from "@ostiary/core/lib/device-accounts";
import { userHasAdminRole } from "@ostiary/core/lib/admin/user-has-admin-role";
import { adminOnSignUp, adminOnVerification, parseAdminEmails } from "@ostiary/core/lib/admin/admin-emails";
import { implicitLinkRefusal } from "@ostiary/core/lib/security/account-linking-policy";
import { isExternalSignInPath, twoFactorStepURL } from "@ostiary/core/lib/security/external-sign-in";
import { revokeUserOAuthTokens } from "@ostiary/core/lib/security/oauth-token-revocation";
import { publicOrganizationRequestRefused } from "@ostiary/core/lib/security/public-organization-guard";
import { isStrictSsoDomain, parseSsoDomain } from "@ostiary/core/lib/security/sso-domain";
import { brand } from "@ostiary/core/lib/brand";
import { PUBLIC_ORGANIZATION_ID } from "@ostiary/core/lib/organization-public";
import { getPasskeyWebAuthnOptions } from "@ostiary/core/lib/passkey-options";
import { env } from "@ostiary/core/lib/env";
import { e2eTestMode } from "@ostiary/core/lib/e2e-test-mode";
import { ipAddressOptions, rateLimitOptions } from "@ostiary/core/lib/rate-limit";
import { ENV_API_SCOPES, OIDC_SCOPES, syncProviderScopes } from "@ostiary/core/lib/oauth-scopes";
import { syncSigningKeys } from "@ostiary/core/lib/signing-keys";
import { oauthResourceIdentifiers } from "@ostiary/core/lib/oauth-resources";
import { withOpenApiLinks } from "@ostiary/core/lib/oauth-resource-access";
import { withWebhookEvents } from "@ostiary/core/lib/webhooks/adapter";
import { ACCESS_TOKEN_EXPIRES_IN, REFRESH_TOKEN_EXPIRES_IN } from "@ostiary/core/lib/oauth-resource-policy";
import { SAML_CLOCK_SKEW_MS, samlResponseRejection } from "@ostiary/core/lib/saml";
import {
    clientExists,
    clientRegistrationSource,
    currentClientRegistrationSettings,
    registrationCapacityLeft,
    syncClientRegistration,
} from "@ostiary/core/lib/client-registration";
import {
    markDynamicRegistration,
    metadataDocumentHostAllowed,
    registrationRequestError,
} from "@ostiary/core/lib/client-registration-policy";
import { googleOneTap, socialProvidersConfig, syncSocialProviders } from "@ostiary/core/lib/social-providers";
import {
    KEY_RATE_LIMIT,
    API_KEY_NAME_MAX_LENGTH,
    MAX_LIFETIME_DAYS_LIMIT,
    ORGANIZATION_KEY_CONFIG_ID,
    USER_KEY_CONFIG_ID,
} from "@ostiary/core/lib/api-key-policy";
import { deleteUserApiKeys } from "@ostiary/core/lib/api-keys";
import { apiKeyVerification } from "@ostiary/core/lib/api-key-verification";
import { ACCOUNT_DELETION_BLOCKED, accountDeletionBlockers } from "@ostiary/core/lib/account-data/blockers";
import { DELETED_USER_LABEL, prepareUserErasure, type ErasureSummary } from "@ostiary/core/lib/account-data/erasure";
import { ACCOUNT_DELETION_LINK_MINUTES } from "@ostiary/core/lib/account-data/limits";
import { queueAccountDeletionEmail } from "@ostiary/core/lib/email/queue-account-deletion-email";
import { emitWebhookEvents } from "@ostiary/core/lib/webhooks/outbox";
import { makeEvent, memberSnapshot } from "@ostiary/core/lib/webhooks/events";
import {
    SCIM_DEACTIVATED_MESSAGE,
    SCIM_DEACTIVATED_REASON,
    scimCredentialHashSecret,
    scimIdentity,
    scimProjection,
} from "@ostiary/core/lib/scim";

type AuditTarget = "user" | "oauth_client" | "sso_provider" | "organization";
type Bag = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

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
 * Endpoints that grant lasting access to the account. They need a sign-in from the last
 * 10 minutes, measured from when the session was created: Better Auth's own `freshAge`
 * counts from the session's last refresh, which a stolen cookie can trigger by itself.
 */
const RECENT_SIGN_IN_PATHS = new Set([
    "/passkey/generate-register-options",
    "/passkey/verify-registration",
    // Connecting a GitHub (or other) account adds a way to sign in, like a passkey.
    "/link-social",
]);
export const RECENT_SIGN_IN_SECONDS = 10 * 60;

/**
 * SSO provider management over HTTP. The admin console manages providers with its own server
 * actions (apps/admin .../sso/actions.ts) after a platform admin check; the plugin's endpoints
 * only check the organization role, so an organization owner could change or delete a provider
 * (or verify its domain) behind the platform admins' back. Only /sso/register stays, guarded
 * by providersLimit (platform admins) and the domain check in the before hook. The shared
 * /sso/callback (no provider in the path) is for the plugin's redirectURI option, not used.
 */
const SSO_MANAGEMENT_PATHS = [
    "/sso/providers",
    "/sso/get-provider",
    "/sso/update-provider",
    "/sso/delete-provider",
    "/sso/request-domain-verification",
    "/sso/verify-domain",
    "/sso/callback",
];

/** Password sign-in endpoints whose failures are counted for the security page. */
const PASSWORD_SIGN_IN_PATHS = new Set(["/sign-in/email", "/sign-in/username"]);

/** Sign-ins that may stop for two-factor authentication: passwords and emailed codes. */
const TWO_STEP_SIGN_IN_PATHS = new Set([...PASSWORD_SIGN_IN_PATHS, "/sign-in/email-otp"]);

type HookContext = {
    path?: string;
    headers?: Headers;
    context: {
        newSession?: { session: { token: string }; user: { id: string } } | null;
        authCookies: { sessionToken: { name: string } };
    };
};

/**
 * Whether this request just started a session it did not already have: an external sign-in
 * (social, SSO, One Tap, verification link). Signing in again re-sets the cookie of the
 * session the browser already had (verify-email while signed in), which is not a new sign-in.
 */
function startedNewSession(ctx: HookContext): boolean {
    const created = ctx.context.newSession;
    if (!created) return false;
    const name = ctx.context.authCookies.sessionToken.name;
    for (const part of (ctx.headers?.get("cookie") ?? "").split(";")) {
        const index = part.indexOf("=");
        if (index < 0 || part.slice(0, index).trim() !== name) continue;
        const value = decodeURIComponent(part.slice(index + 1).trim());
        if (value.split(".")[0] === created.session.token) return false;
    }
    return true;
}

/** Admin-only endpoints. An admin who must turn on two-factor authentication first cannot call them. */
function isAdminPath(path: string): boolean {
    // Never block the way back from impersonation.
    if (path === "/admin/stop-impersonating") return false;
    return path.startsWith("/admin/") || path === "/sso/register" || path === "/organization/create";
}

/**
 * Records a password or code sign-in once it has a session. Placed after the twoFactor plugin,
 * whose hook deletes the session (and clears `newSession`) while the second step is pending: that
 * sign-in is counted when the code is verified, by the session hook.
 */
const passwordSignInEvents = {
    id: "ostiary-password-sign-in-events",
    hooks: {
        after: [
            {
                // External sign-ins too: they may stop for two-factor authentication as well.
                matcher: (ctx) => TWO_STEP_SIGN_IN_PATHS.has(ctx.path ?? "") || (isExternalSignInPath(ctx.path) && startedNewSession(ctx)),
                handler: createAuthMiddleware(async (ctx) => {
                    const created = ctx.context.newSession;
                    if (created) await recordAuthEvent("sign_in", created.user.id);
                }),
            },
        ],
    },
} satisfies BetterAuthPlugin;

/**
 * SAML responses reach the ACS (and SLO, which stays off) from the identity provider. The
 * plugin validates them; this refuses, before any XML parser runs, one that carries a DTD
 * (XXE, entity expansion) or is not plain base64.
 */
const samlResponseGuard = {
    id: "ostiary-saml-response-guard",
    hooks: {
        before: [
            {
                matcher: (ctx) => (ctx.path ?? "").startsWith("/sso/saml2/sp/"),
                handler: createAuthMiddleware(async (ctx) => {
                    const body = (ctx.body ?? {}) as Record<string, unknown>;
                    const value = body.SAMLResponse ?? body.SAMLRequest;
                    if (value === undefined && ctx.path?.startsWith("/sso/saml2/sp/metadata")) return;
                    const rejection = samlResponseRejection(value);
                    if (rejection) throw new APIError("BAD_REQUEST", { message: rejection, code: "SAML_RESPONSE_REJECTED" });
                }),
            },
        ],
    },
} satisfies BetterAuthPlugin;

/**
 * The email OTP plugin's endpoints other than sign-in codes. Email verification and password
 * reset keep their links, so these stay closed rather than becoming a second, unprotected way
 * to do the same thing (and to send email to any address).
 */
const UNUSED_EMAIL_OTP_PATHS = [
    "/email-otp/check-verification-otp",
    "/email-otp/verify-email",
    "/email-otp/request-password-reset",
    "/forget-password/email-otp",
    "/email-otp/reset-password",
    "/email-otp/request-email-change",
    "/email-otp/change-email",
];

/**
 * The API key plugin's HTTP endpoints. Keys are created, listed and revoked only through the
 * dashboard's and the admin console's server actions, which apply Ostiary's rules (the global
 * switch, one registered API and its scopes, the maximum lifetime) and write the audit log.
 * The plugin's verification has no HTTP route; APIs use /api-key/verify (api-key-verification.ts).
 */
/**
 * Better Auth's default organization roles, unchanged, plus the API key plugin's `apiKey`
 * resource: owners and admins manage the organization's keys, members do not.
 */
const organizationAc = createAccessControl({
    ...defaultStatements,
    apiKey: ["create", "read", "update", "delete"],
});
const organizationRoles = {
    owner: organizationAc.newRole({ ...ownerAc.statements, apiKey: ["create", "read", "update", "delete"] }),
    admin: organizationAc.newRole({ ...adminAc.statements, apiKey: ["create", "read", "update", "delete"] }),
    member: organizationAc.newRole({ ...memberAc.statements }),
};

const API_KEY_PLUGIN_PATHS = ["/api-key/create", "/api-key/get", "/api-key/update", "/api-key/delete", "/api-key/list"];

/**
 * Better Auth's GET link that deletes the account when opened. Ostiary's email links to a page
 * instead (apps/auth .../delete-account), where the signed-in person confirms with a POST to
 * /delete-user carrying the token: a mail scanner opening links cannot delete anyone.
 */
const DELETE_USER_LINK_PATH = "/delete-user/callback";

/**
 * Memberships of accounts being deleted, read before the delete (the foreign key removes them)
 * and sent as `organization.member.removed` once it is done. Keyed by account id.
 */
const pendingErasures = new Map<string, ErasureSummary["memberships"]>();

/** Refuses a deletion while one of the blockers applies (admin, sole owner, SCIM). */
async function assertAccountDeletable(userId: string) {
    const blockers = await accountDeletionBlockers(db, userId);
    if (blockers.length === 0) return;
    throw new APIError("FORBIDDEN", {
        message: "This account cannot be deleted yet. See the account page for what to do first.",
        code: ACCOUNT_DELETION_BLOCKED,
        blockers: blockers.map((b) => b.kind),
    });
}

/** Prefix of new API keys. */
const API_KEY_PREFIX = env.API_KEY_PREFIX ?? "ost_";

/** First-run setup: these addresses get the admin role once proven, see admin/admin-emails.ts. */
const adminEmails = parseAdminEmails(env.ADMIN_EMAILS);

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
 * Ends what apps hold for an account: OAuth access and refresh tokens (and API keys on a ban).
 * Sessions are deleted by Better Auth itself (ban, password reset).
 */
async function revokeAppAccess(
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

/**
 * Records that a client came from /oauth2/register (`oauth_client.metadata`), which is how
 * the admin console and the consent screen tell it from an admin-registered one. If that
 * fails the client is deleted, so an unmarked client never passes for a reviewed one.
 */
async function markDynamicClient(
    returned: unknown,
    actor: { id: string; email: string } | null,
    ipAddress: string | null,
) {
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
        actor: actor ? { id: actor.id, email: actor.email } : null,
        action: "oauth_client.self_register",
        target: { type: "oauth_client", id: clientId, label: str(created.client_name) ?? null },
        metadata: { source: "dynamic", redirect_uris: created.redirect_uris, scope: created.scope },
        ipAddress,
    });
}

export type AuthFactoryOptions = {
    /**
     * Canonical URL of the auth app. Every instance uses it, even when served from another
     * origin: OAuth issuer, SSO callbacks and invitation links all land on the auth app.
     */
    baseURL: string;
    /** Origins allowed as callbackURL and for state-changing requests (includes the serving app). */
    trustedOrigins: string[];
    /** Parent domain shared by every app, e.g. `.example.com`. Enables cross-app session cookies. */
    cookieDomain?: string;
};

/**
 * Builds the Better Auth instance shared by every app in the monorepo. Each app
 * calls this with its own origin; they all read and write the same database and
 * use the same secret, so a session created by the auth app is valid in the admin app.
 */
export function createAuth({ baseURL, trustedOrigins, cookieDomain }: AuthFactoryOptions) {
    const passkeyWebAuthn = getPasskeyWebAuthnOptions(baseURL);
    const captchaOptions = captchaPluginOptions(baseURL);
    const twoFactorPlugin = twoFactor({
        issuer: brand.name,
        // Users without a password (passkey or GitHub only) can turn it on too, so an
        // admin who never set a password is not locked out of the console. Accounts with
        // a password must still confirm it.
        allowPasswordless: true,
    });
    /**
     * The twoFactor plugin asks for the second step after password sign-ins only. A sign-in
     * code proves the inbox: one factor, like a password. Run the same check after it (trusted
     * device, else the /two-factor challenge), so a code never skips an authenticator.
     */
    const emailCodeTwoFactor = {
        id: "ostiary-email-code-two-factor",
        hooks: {
            after: twoFactorPlugin.hooks.after.map((hook) => ({
                ...hook,
                matcher: (ctx: { path?: string }) => ctx.path === "/sign-in/email-otp",
            })),
        },
    } satisfies BetterAuthPlugin;
    /**
     * The same second step after sign-ins that skip the password: social providers (redirect,
     * ID token, One Tap), SSO and the verification link. An account with two-factor
     * authentication keeps it whatever the way in, so REQUIRE_ADMIN_2FA holds for every admin
     * session. The two-factor plugin's own check runs first (trusted device, else the session is
     * deleted and the short-lived two-factor cookie set); a browser redirect then goes to the
     * two-factor page instead of the sign-in's destination, which it continues to afterwards
     * (the app's authorization request, when one is pending). JSON sign-ins (One Tap, ID token)
     * answer `twoFactorRedirect` like a password sign-in.
     */
    const isTwoFactorChallenge = (value: unknown) =>
        Boolean(value && typeof value === "object" && !(value instanceof Error) && (value as Bag).twoFactorRedirect === true);
    const externalSignInTwoFactor = {
        id: "ostiary-external-sign-in-two-factor",
        hooks: {
            after: [
                ...twoFactorPlugin.hooks.after.map((hook) => ({
                    ...hook,
                    matcher: (ctx: HookContext) => isExternalSignInPath(ctx.path) && startedNewSession(ctx),
                })),
                {
                    matcher: (ctx: HookContext & { context: { returned?: unknown; responseHeaders?: Headers } }) =>
                        isExternalSignInPath(ctx.path) &&
                        isTwoFactorChallenge(ctx.context.returned) &&
                        Boolean(ctx.context.responseHeaders?.get("location")),
                    handler: createAuthMiddleware(async (ctx) => {
                        const serverContext = (await getOAuthState())?.serverContext as Bag | undefined;
                        throw ctx.redirect(
                            twoFactorStepURL(baseURL, {
                                location: ctx.context.responseHeaders?.get("location"),
                                oauthQuery: str(serverContext?.query),
                            }),
                        );
                    }),
                },
            ],
        },
    } satisfies BetterAuthPlugin;
    // Client ID Metadata Documents (the client_id is an HTTPS URL to the client's JSON
    // metadata, as MCP clients use). Added to the provider only while an admin has turned it
    // on, see syncClientRegistration. Better Auth's Node transport resolves the host once,
    // refuses private and reserved addresses, pins the connection and never follows
    // redirects; documents are capped at 5 KB and fetched with a 5 s timeout.
    const metadataDocuments = {
        clientDiscovery: createCimdClientDiscovery({
            fetchClientMetadataResource,
            // Requires client_name and redirect_uris, both shown on the consent screen.
            metadataProfile: "mcp-2026-07-28",
            isMetadataDocumentUrlAllowed: async (url) => {
                const settings = await currentClientRegistrationSettings();
                if (!settings.metadataDocuments) return false;
                if (!metadataDocumentHostAllowed(url, settings.metadataDocumentHosts)) return false;
                // Refreshing a known client is not a new registration.
                return (await clientExists(url)) || (await registrationCapacityLeft(settings));
            },
            onClientCreated: async ({ client, context }) => {
                await recordAudit({
                    actor: null,
                    action: "oauth_client.self_register",
                    target: { type: "oauth_client", id: client.clientId, label: client.name ?? null },
                    metadata: { source: "metadata_document" },
                    ipAddress: clientIp(context.headers),
                });
            },
        }),
    };
    // Signs ID tokens and JWT access tokens and publishes /jwks. Key rotation (interval and
    // grace period) is set from the admin console before each request, see syncSigningKeys:
    // Better Auth reads both from this options object on every call.
    const jwtOptions: JwtOptions = { jwks: {} };
    const provider = oauthProvider({
        loginPage: "/login",
        consentPage: "/consent",
        // Self-registration (Dynamic Client Registration, metadata documents) is off here and
        // set from the admin console's settings before each request, see syncClientRegistration.
        allowDynamicClientRegistration: false,
        allowUnauthenticatedClientRegistration: false,
        // Only for clients that ask with prompt=select_account (e.g. a native app signing in
        // through the system browser, whose session may belong to someone else).
        selectAccount: { page: "/select-account", shouldRedirect: () => false },
        // Replaced from the database before each request, see syncProviderScopes.
        scopes: [...OIDC_SCOPES, ...ENV_API_SCOPES],
        // Protected resources (1.7 replaces `validAudiences`): the auth server, then the APIs in
        // OAUTH_API_AUDIENCES. The build registers the same rows first (`db:seed`), see
        // db/seed-resources.ts. APIs added from the admin console live only in the database.
        resources: oauthResourceIdentifiers(baseURL),
        // A client gets a token for an API only if it is linked to it. APIs open to every
        // application (the default) count as linked to every client, see withOpenApiLinks.
        enforcePerClientResources: true,
        // 1.7 requires a policy before anyone may grant client_credentials scopes. Only
        // platform admins may; every other client action keeps its 1.5 behavior.
        clientPrivileges: ({ action, user }) =>
            action === "configure-client-credentials-scopes"
                ? userHasAdminRole(user?.role as string | null | undefined, ["admin"])
                : true,
        // The resource admin endpoints are server-only; this keeps them admin-only as well.
        resourcePrivileges: ({ user }) =>
            userHasAdminRole(user?.role as string | null | undefined, ["admin"]),
        // Explicit (not left to the library default): resource servers reject tokens
        // only after expiry, so this bounds how long a leaked access token works.
        accessTokenExpiresIn: ACCESS_TOKEN_EXPIRES_IN,
        // Better Auth's default, explicit because per-API lifetimes can only be shorter.
        refreshTokenExpiresIn: REFRESH_TOKEN_EXPIRES_IN,
        // Resource servers authorize on the admin plugin's role (e.g. "admin" or "admin,user").
        customAccessTokenClaims: ({ user }) =>
            typeof user?.role === "string" ? { role: user.role } : {},
        // 1.7 leaves profile and email claims out of ID tokens (they are on UserInfo).
        // Many OIDC clients read them from the ID token, so keep issuing them per scope.
        customIdTokenClaims: ({ user, scopes }) => ({
            ...(scopes.includes("profile")
                ? { name: user.name, ...(user.image ? { picture: user.image } : {}) }
                : {}),
            ...(scopes.includes("email")
                ? { email: user.email, email_verified: Boolean(user.emailVerified) }
                : {}),
        }),
    });

    // API keys for the APIs registered in Ostiary, owned by users ("default" configuration) or
    // by organizations ("organization": `referenceId` is the organization id). Each key holds one
    // API and some of its scopes in `permissions`. Never a session: `enableSessionForAPIKeys`
    // stays off (the default), so a key sent to Ostiary itself (x-api-key or otherwise) signs
    // nobody in, on the auth app as on the admin console.
    const apiKeyConfig = {
        enableSessionForAPIKeys: false,
        defaultPrefix: API_KEY_PREFIX,
        // 64 random letters after the prefix (the default), stored as a SHA-256 digest.
        startingCharactersConfig: { shouldStore: true, charactersLength: API_KEY_PREFIX.length + 6 },
        requireName: true,
        maximumNameLength: API_KEY_NAME_MAX_LENGTH,
        // Every key expires; the admin console sets the maximum (checked before creation).
        keyExpiration: { defaultExpiresIn: null, minExpiresIn: 1, maxExpiresIn: MAX_LIFETIME_DAYS_LIMIT },
        rateLimit: { enabled: true, timeWindow: KEY_RATE_LIMIT.timeWindowMs, maxRequests: KEY_RATE_LIMIT.maxRequests },
    } as const;
    const apiKeys = apiKey([
        { ...apiKeyConfig, configId: USER_KEY_CONFIG_ID, references: "user" },
        // The plugin checks the creator's organization role (`apiKey: ["create"]`, see
        // organizationRoles) on top of Ostiary's own check in the dashboard action.
        { ...apiKeyConfig, configId: ORGANIZATION_KEY_CONFIG_ID, references: "organization" },
    ]);

    return betterAuth({
        baseURL,
        // Sign in with Apple returns with a form POST from Apple's origin.
        trustedOrigins: [...trustedOrigins, "https://appleid.apple.com"],
        disabledPaths: [...UNUSED_EMAIL_OTP_PATHS, ...API_KEY_PLUGIN_PATHS, DELETE_USER_LINK_PATH, ...SSO_MANAGEMENT_PATHS],
        // Per-IP limits counted in the database, shared by every serverless instance. Rules in
        // lib/rate-limit.ts; off in development unless RATE_LIMIT_ENABLED=true.
        rateLimit: rateLimitOptions(env),
        advanced: {
            // Client IP for rate limits and sessions: IP_ADDRESS_HEADERS and TRUSTED_PROXIES.
            ipAddress: ipAddressOptions(env),
            ...(cookieDomain
                ? { crossSubDomainCookies: { enabled: true, domain: cookieDomain } }
                : {}),
        },
        databaseHooks: {
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
                        const actor = context?.context.session?.user;
                        // Apps lose access too: refresh tokens stop working, as with SCIM deactivation.
                        await revokeAppAccess(updatedUser, "banned", actor ? { id: actor.id, email: actor.email } : null, ipAddress);
                        const revoked = await deleteUserApiKeys(updatedUser.id);
                        if (revoked === 0) return;
                        await recordAudit({
                            actor: actor ? { id: actor.id, email: actor.email } : null,
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
        },
        hooks: {
            before: createAuthMiddleware(async (ctx) => {
                // APIs registered from the admin console add scopes without a redeploy.
                await syncProviderScopes(provider.options);
                // Signing key rotation interval and grace period, from the admin console.
                await syncSigningKeys(jwtOptions);
                // Sign-in providers enabled from the admin console, without a restart.
                await syncSocialProviders(ctx.context);
                // Google One Tap answers only while the admin console has it on (and Google too).
                if (ctx.path === "/one-tap/callback" && !(await googleOneTap())) {
                    throw new APIError("NOT_FOUND", { message: "Google One Tap is not enabled." });
                }
                if (env.REQUIRE_ADMIN_2FA === "true" && isAdminPath(ctx.path)) {
                    const current = await getSessionFromCtx(ctx);
                    if (current && adminNeedsTwoFactor(current.user as { role?: string | null; twoFactorEnabled?: boolean | null }, true)) {
                        throw new APIError("FORBIDDEN", {
                            message: "Turn on two-factor authentication to use admin features.",
                            code: "TWO_FACTOR_REQUIRED",
                        });
                    }
                }
                const registration = await syncClientRegistration(provider.options, metadataDocuments);
                if (ctx.path === "/device/code") {
                    // Device sign-in shows only the app's name to the user, who types a code
                    // elsewhere: an easy phishing setup for an app nobody reviewed. Self-registered
                    // clients (whatever grants their metadata lists) sign in through the browser.
                    const clientId = str((ctx.body as Bag | undefined)?.client_id);
                    if (clientId && (await clientRegistrationSource(clientId)) !== "admin") {
                        throw new APIError("BAD_REQUEST", {
                            error: "unauthorized_client",
                            error_description: "Self-registered clients cannot use device sign-in",
                        });
                    }
                    return;
                }
                if (ctx.path === "/oauth2/register" && registration.dynamic !== "off") {
                    // Better Auth checks scopes, redirect URIs and PKCE. Self-registered clients
                    // also get no machine access, and an hourly cap across instances limits abuse
                    // (on top of Better Auth's per-IP limit of 5 registrations a minute).
                    const refused = registrationRequestError(ctx.body);
                    if (refused) {
                        throw new APIError("BAD_REQUEST", { error: "invalid_client_metadata", error_description: refused });
                    }
                    if (!(await registrationCapacityLeft(registration))) {
                        throw new APIError("TOO_MANY_REQUESTS", {
                            error: "temporarily_unavailable",
                            error_description: "Too many clients registered in the last hour. Try again later.",
                        });
                    }
                    return;
                }
                if (ctx.path === "/sso/register") {
                    // One parser for the domain everywhere (sso-domain.ts): a value that the plugin
                    // (tldts) and the DNS verification (URL) could read differently is refused.
                    const domain = (ctx.body as Bag | undefined)?.domain;
                    if (typeof domain !== "string" || parseSsoDomain(domain) !== domain) {
                        throw new APIError("BAD_REQUEST", {
                            message: "Enter one email domain in lowercase, e.g. acme.com.",
                            code: "INVALID_SSO_DOMAIN",
                        });
                    }
                    return;
                }
                if (ctx.path.startsWith("/organization/")) {
                    // The Public organization holds every account: its members are not listed to them.
                    const current = await getSessionFromCtx(ctx);
                    if (!current) return; // The endpoint answers 401.
                    const input = { ...((ctx.query ?? {}) as Bag), ...((ctx.body ?? {}) as Bag) };
                    const refused = publicOrganizationRequestRefused(ctx.path, input, {
                        isPlatformAdmin: userHasAdminRole(current.user.role as string | null | undefined, ["admin"]),
                        activeOrganizationId: (current.session as { activeOrganizationId?: string | null }).activeOrganizationId,
                    });
                    if (refused) {
                        throw new APIError("FORBIDDEN", {
                            message: "The Public organization's members are managed by platform admins only.",
                            code: "PUBLIC_ORGANIZATION_RESTRICTED",
                        });
                    }
                    return;
                }
                if (RECENT_SIGN_IN_PATHS.has(ctx.path)) {
                    const current = await getSessionFromCtx(ctx);
                    // An impersonation session is fresh too, but an admin viewing an account must
                    // not add their own way into it.
                    if (current?.session.impersonatedBy) {
                        throw new APIError("FORBIDDEN", {
                            message: "A sign-in method cannot be added while an administrator is viewing the account.",
                            code: "IMPERSONATING",
                        });
                    }
                    const signedInAt = current ? new Date(current.session.createdAt).getTime() : 0;
                    if (current && Date.now() - signedInAt > RECENT_SIGN_IN_SECONDS * 1000) {
                        throw new APIError("FORBIDDEN", {
                            message: "Sign in again to add a new way to sign in.",
                            code: "RECENT_SIGN_IN_REQUIRED",
                        });
                    }
                    return;
                }
                if (ctx.path === "/delete-user") {
                    // Self-service deletion. Step 1 (no token) sends the confirmation email; step 2
                    // (the emailed token) deletes. Better Auth ties the token to the signed-in account.
                    const current = await getSessionFromCtx(ctx);
                    if (!current) return; // The endpoint answers 401.
                    if (current.session.impersonatedBy) {
                        throw new APIError("FORBIDDEN", {
                            message: "An account cannot be deleted while an administrator is viewing it.",
                            code: "IMPERSONATING",
                        });
                    }
                    const body = (ctx.body ?? {}) as Bag;
                    // Blockers are checked again on step 2 (beforeDelete), as things may change in between.
                    if (typeof body.token === "string" && body.token) return;
                    await assertAccountDeletable(current.user.id);
                    // Re-enter the password when there is one (Better Auth checks it). Without one
                    // (passkey, social, SSO, codes), the sign-in itself must be recent.
                    if (typeof body.password === "string" && body.password) return;
                    const credential = await ctx.context.internalAdapter.findCredentialAccount(current.user.id);
                    if (credential?.password) {
                        throw new APIError("FORBIDDEN", {
                            message: "Enter your password to delete your account.",
                            code: "PASSWORD_REQUIRED",
                        });
                    }
                    const signedInAt = new Date(current.session.createdAt).getTime();
                    if (Date.now() - signedInAt > RECENT_SIGN_IN_SECONDS * 1000) {
                        throw new APIError("FORBIDDEN", {
                            message: "Sign in again to delete your account.",
                            code: "RECENT_SIGN_IN_REQUIRED",
                        });
                    }
                    return;
                }
                if (ctx.path === "/change-email") {
                    // Better Auth only asks the current inbox to approve a change when that address is
                    // verified; for an unverified one it emails the new address directly. Refuse that
                    // case so a stolen session cookie alone can never move an account to another inbox.
                    const current = await getSessionFromCtx(ctx);
                    if (current && !current.user.emailVerified) {
                        throw new APIError("FORBIDDEN", {
                            message: "Verify your current email address before changing it.",
                            code: "EMAIL_NOT_VERIFIED",
                        });
                    }
                    return;
                }
                // Signing out of one of several accounts (account switcher) deletes that session only.
                if (ctx.path === "/multi-session/revoke") {
                    const token = (ctx.body as { sessionToken?: unknown } | undefined)?.sessionToken;
                    const revoked = typeof token === "string" ? await ctx.context.internalAdapter.findSession(token) : null;
                    if (revoked) await recordAuthEvent("sign_out", revoked.user.id, { ipAddress: clientIp(ctx.headers) });
                    return;
                }
                // Sign-out deletes the session, so read who is signing out before the handler runs.
                // With several accounts signed in, it signs out of all of them; this records the active one.
                if (ctx.path !== "/sign-out") return;
                const current = await getSessionFromCtx(ctx);
                if (current) await recordAuthEvent("sign_out", current.user.id, { ipAddress: clientIp(ctx.headers) });
            }),
            after: createAuthMiddleware(async (ctx) => {
                const returned = ctx.context.returned;
                const failed = returned instanceof Error;
                const body = (ctx.body ?? {}) as Record<string, unknown>;

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
                const actor = ctx.context.session?.user;
                const response = (returned && typeof returned === "object" ? returned : {}) as Bag;
                const targetId = audited.id?.(body, response);
                const metadata = Object.fromEntries(Object.entries(body).filter(([key]) => !SECRET_FIELDS.has(key)));
                await recordAudit({
                    actor: actor ? { id: actor.id, email: actor.email } : null,
                    action: audited.action,
                    target: audited.target && targetId ? { type: audited.target, id: targetId } : undefined,
                    metadata: Object.keys(metadata).length ? metadata : undefined,
                    ipAddress: clientIp(ctx.headers),
                });
            }),
        },
        // Per-API access: APIs open to every application count as linked to every client.
        // User and membership changes become webhook events once committed (lib/webhooks).
        database: withOpenApiLinks(
            withWebhookEvents(
                drizzleAdapter(db, {
                    provider: "pg",
                    schema,
                    // Real transactions (the SCIM plugin refuses to start without them). Better Auth then
                    // runs multi-step writes such as sign-up atomically; after-hooks still run post-commit.
                    transaction: true,
                }),
            ),
        ),
        // The environment's (GitHub); the admin console's are added per request, see syncSocialProviders.
        socialProviders: socialProvidersConfig(),
        account: {
            accountLinking: {
                enabled: true,
                // Explicit "Connect GitHub" from the dashboard may use a different email: the user is
                // signed in and, per the hooks below, signed in recently (and not impersonated). Sign-in
                // with GitHub only joins an existing account when GitHub reports that email as verified
                // and the account's own email is verified (Better Auth defaults), and never an account
                // with two-factor authentication or an admin (validateUserInfo below).
                allowDifferentEmails: true,
            },
        },
        session: {
            // Deleting the account and similar actions need a session refreshed in the last
            // 10 minutes (default: a day). Passkeys use the stricter check in the hooks below.
            freshAge: RECENT_SIGN_IN_SECONDS,
            // Required by @better-auth/oauth-provider as soon as any session option is set (its
            // init throws otherwise). Sessions already live in the database here, so no change.
            storeSessionInDatabase: true,
        },
        user: {
            // Runs before an identity provider creates, links or signs in an account.
            validateUserInfo: async ({ user, source }, ctx) => {
                // SSO providers whose stored domain is not one plain hostname (older rows, or
                // written before the check): their domain could be read two ways, see sso-domain.ts.
                if ((source.method === "sso-oidc" || source.method === "sso-saml") && source.sso?.providerId) {
                    const [provider] = await db
                        .select({ domain: schema.ssoProvider.domain })
                        .from(schema.ssoProvider)
                        .where(eq(schema.ssoProvider.providerId, source.sso.providerId));
                    if (!provider || !isStrictSsoDomain(provider.domain)) {
                        return { error: "invalid_provider_domain", errorDescription: "This SSO provider's domain must be set again by an administrator." };
                    }
                }
                if (source.action !== "link-account") return;
                // Connecting a provider from the dashboard (signed in) is an explicit link.
                const explicit = ctx.path === "/link-social" || Boolean((await getOAuthState())?.link);
                if (explicit || typeof user.id !== "string") return;
                const existing = await ctx.context.internalAdapter.findUserById(user.id);
                const refusal = existing ? implicitLinkRefusal(existing as { role?: string | null; twoFactorEnabled?: boolean | null }) : null;
                if (refusal) return { error: "account_not_linked", errorDescription: refusal };
            },
            // "Delete my account" on the dashboard: password or recent sign-in (hook above), then
            // an emailed link to a confirmation page. Blockers in account-data/blockers.ts.
            deleteUser: {
                enabled: true,
                deleteTokenExpiresIn: ACCOUNT_DELETION_LINK_MINUTES * 60,
                sendDeleteAccountVerification: async ({ user, token }, request) => {
                    const locale = emailLocale(request?.headers);
                    const url = `${baseURL}/${locale}/delete-account?token=${encodeURIComponent(token)}`;
                    await queueAccountDeletionEmail({ to: user.email, url, locale });
                },
                beforeDelete: async (user) => {
                    await assertAccountDeletable(user.id);
                },
                afterDelete: async (user) => {
                    // No email, name or IP: the entry outlives the person it is about.
                    await recordAudit({
                        actor: null,
                        action: "user.self_delete",
                        target: { type: "user", id: user.id, label: DELETED_USER_LABEL },
                    });
                },
            },
            changeEmail: {
                enabled: true,
                // The current address must approve the change first, then the new address is
                // verified. A stolen session alone cannot move the account to another inbox.
                sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
                    queueChangeEmailConfirmation({ to: user.email, newEmail, url });
                },
            },
        },
        emailVerification: {
            sendVerificationEmail: async ({ user, url }) => {
                queueVerificationEmail({ to: user.email, url });
            },
            sendOnSignUp: true,
            sendOnSignIn: true,
            autoSignInAfterVerification: true,
        },
        emailAndPassword: {
            enabled: true,
            autoSignIn: false,
            requireEmailVerification: true,
            revokeSessionsOnPasswordReset: true,
            // Whoever had the old password may also hold apps' refresh tokens: revoke those too.
            onPasswordReset: async ({ user }, request) => {
                await revokeAppAccess(user, "password_reset", null, request ? clientIp(request.headers) : null);
            },
            sendResetPassword: async ({ user, url }) => {
                queuePasswordResetEmail({ to: user.email, url });
            },
        },
        plugins: [
            jwt(jwtOptions),
            admin({
                // Only Better Auth's two roles ("admin", "user"): set-role and create-user refuse
                // anything else, such as "user, admin", which Ostiary and Better Auth would read
                // differently.
                roles: platformRoles,
                bannedUserMessage: (user: { banReason?: string | null }) =>
                    user.banReason === SCIM_DEACTIVATED_REASON
                        ? SCIM_DEACTIVATED_MESSAGE
                        : "You have been banned from this application. Please contact support if you believe this is an error.",
            }),
            lastLoginMethod({
                customResolveMethod: (ctx) => {
                    if (ctx.path.includes("sign-in/username")) return "username";
                    // A One Tap sign-in is a Google sign-in (the "last used" hint and button).
                    if (ctx.path === "/one-tap/callback") return "google";
                    return null;
                },
            }),
            username(),
            // Skipped in end-to-end tests only (an external HTTP call), see lib/e2e-test-mode.ts.
            haveIBeenPwned({ enabled: !e2eTestMode() }),
            // Authenticator app (TOTP) and backup codes. The second step applies to every sign-in
            // except passkeys (already two factors): passwords, emailed codes (emailCodeTwoFactor),
            // social, One Tap, SSO and verification links (externalSignInTwoFactor). Must come before
            // the OAuth provider: its hook replaces the sign-in response before an authorization resumes.
            twoFactorPlugin,
            emailCodeTwoFactor,
            externalSignInTwoFactor,
            passwordSignInEvents,
            // "Email me a sign-in code": a 6-digit code, typed on the sign-in page that asked for
            // it, so an OAuth sign-in carries on in that tab even when the email is read on a phone.
            emailOTP({
                // A code signs in to an existing account only. Creating one takes the sign-up page
                // (username, password, captcha); an unknown address gets the same answer and no email.
                disableSignUp: true,
                otpLength: SIGN_IN_CODE_LENGTH,
                expiresIn: SIGN_IN_CODE_MINUTES * 60,
                // Kept as a hash, like a password: a database read does not reveal live codes.
                storeOTP: "hashed",
                // Better Auth's defaults, stated: 3 wrong codes void the code, and each IP may ask
                // for 3 codes and try 3 times a minute (counted in the database, see lib/rate-limit.ts).
                allowedAttempts: 3,
                rateLimit: { window: 60, max: 3 },
                // A code proves the inbox. Better Auth marks an unverified account as verified on
                // first use, after removing its password and sessions (they were never proven).
                sendVerificationOTP: async ({ email, otp, type }, ctx) => {
                    if (type !== "sign-in") return;
                    const locale = emailLocale(ctx?.headers ?? ctx?.request?.headers);
                    void queueSignInCodeEmail({ to: email, code: otp, locale }).catch((error: unknown) => {
                        console.error("[email] sign-in code error:", error);
                    });
                },
            }),
            // Optional: off unless CAPTCHA_PROVIDER, CAPTCHA_SITE_KEY and CAPTCHA_SECRET_KEY are set.
            ...(captchaOptions ? [captcha(captchaOptions)] : []),
            // Google One Tap on the sign-in and sign-up pages, off unless turned on for Google in the
            // admin console (see the before hook). No options here: the endpoint reads Google's
            // client ID, `hd` and sign-up setting from `socialProviders.google` on each request,
            // which syncSocialProviders keeps equal to the admin console's settings. It checks the
            // ID token's signature (Google's keys), issuer, audience and age, then signs in like
            // "Continue with Google": same account linking, the two-factor step for accounts that
            // have it, and a pending OAuth authorization resumes (the client sends the signed
            // `oauth_query`).
            oneTap(),
            passkey({
                rpID: passkeyWebAuthn.rpID,
                rpName: passkeyWebAuthn.rpName,
                origin: passkeyWebAuthn.origin,
            }),
            organization({
                // Better Auth's default roles, plus organization API keys for owners and admins.
                ac: organizationAc,
                roles: organizationRoles,
                // Only platform admins can create organizations. The check runs on the
                // server, so the UI is not the only gate.
                allowUserToCreateOrganization: (user) =>
                    userHasAdminRole(user.role, ["admin"]),
                sendInvitationEmail: async (data) => {
                    const inviteUrl = `${baseURL}/${routing.defaultLocale}/accept-invitation/${data.id}`;
                    queueOrganizationInviteEmail({
                        to: data.email,
                        inviteUrl,
                        organizationName: data.organization.name,
                        inviterName: data.inviter.user.name,
                    });
                },
            }),
            provider,
            // RFC 8628 device sign-in for CLIs, TVs and other apps without a browser. Clients opt in
            // with the device_code grant (admin console). The device shows a code, the user enters
            // it on the auth app's /device page, then the device collects tokens at /oauth2/token.
            oauthDeviceAuthorization({
                // The page, not the plugin's JSON endpoint (`/api/auth/device`). The locale is added
                // by the auth app's middleware.
                verificationUri: `${baseURL}/device`,
                expiresIn: "10m",
                interval: "5s",
            }),
            // Enterprise SSO (OIDC / SAML 2.0) per organization. Providers are managed from the admin app.
            // Only platform admins may register providers: a provider claims an email domain, so
            // letting any user register one would let them intercept that domain's SSO sign-ins.
            samlResponseGuard,
            sso({
                // A provider only takes sign-ins once its domain owner publishes a DNS TXT record.
                domainVerification: { enabled: true, tokenPrefix: "ostiary" },
                // SAML: SP-initiated only. Every response must answer an AuthnRequest this server sent
                // (InResponseTo, single use, 5 minutes) and each assertion ID is accepted once. The
                // plugin also checks the signature against the IdP's certificate (samlify refuses an
                // unsigned response), the audience, the bearer Recipient and the Destination.
                // Assertions must carry NotBefore/NotOnOrAfter, within a minute of clock drift, and
                // SHA-1 / RSA1_5 / 3DES are refused (signature algorithms of POST responses by
                // samlResponseGuard: the plugin only checks the Redirect binding's SigAlg).
                saml: {
                    enableInResponseToValidation: true,
                    allowIdpInitiated: false,
                    requireTimestamps: true,
                    clockSkew: SAML_CLOCK_SKEW_MS,
                    algorithms: { onDeprecated: "reject" },
                },
                providersLimit: (user) =>
                    userHasAdminRole((user as { role?: string | null }).role, ["admin"]) ? 100 : 0,
            }),
            // Several accounts in one browser: the account menu switches between them and the
            // select-account page (prompt=select_account) lets the person pick one. Each account
            // has its own signed cookie, scoped like the session cookie (shared across subdomains).
            multiSession({ maximumSessions: MAX_DEVICE_SESSIONS }),
            // SCIM 2.0 provisioning at /api/auth/scim/v2, one connection per organization.
            // Connections and tokens are managed only through the plugin's server-only endpoints,
            // which have no HTTP route: the admin console calls them after its admin check
            // (see apps/admin .../organizations/[id]/scim-actions.ts). Okta or Entra authenticate
            // with the bearer token; nothing else (no session, no API key) reaches SCIM.
            apiKeys,
            apiKeyVerification({
                providerOptions: provider.options,
                verifyApiKey: apiKeys.endpoints.verifyApiKey as never,
                authServer: baseURL,
            }),
            scim({
                connections: [],
                managedConnections: { credentialHashSecret: scimCredentialHashSecret(env) },
                identity: scimIdentity,
                projection: scimProjection,
                // Entra ID sends this legacy group schema; accepting it avoids failed group pushes.
                compatibility: { microsoftEntra: { acceptLegacyGroupSchema: true } },
            }),
        ],
    });
}
