import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, getOAuthState } from "better-auth/api";
import { tryGetCurrentAuthEndpointContext } from "@better-auth/core/context";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { apiKey } from "@better-auth/api-key";
import { createCimdClientDiscovery } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { oauthDeviceAuthorization, oauthProvider } from "@better-auth/oauth-provider";
import { eq } from "drizzle-orm";
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
import { clientIp } from "@ostiary/core/lib/auth-events";
import { MAX_DEVICE_SESSIONS } from "@ostiary/core/lib/device-accounts";
import { isPlatformAdmin } from "@ostiary/core/lib/admin/user-has-admin-role";
import { implicitLinkRefusal } from "@ostiary/core/lib/security/account-linking-policy";
import { isStrictSsoDomain, SSO_DOMAIN_TOKEN_PREFIX } from "@ostiary/core/lib/security/sso-domain";
import { brand } from "@ostiary/core/lib/brand";
import { getPasskeyWebAuthnOptions } from "@ostiary/core/lib/passkey-options";
import { env } from "@ostiary/core/lib/env";
import { e2eTestMode } from "@ostiary/core/lib/e2e-test-mode";
import { ipAddressOptions, rateLimitOptions } from "@ostiary/core/lib/rate-limit";
import { ENV_API_SCOPES, OIDC_SCOPES } from "@ostiary/core/lib/oauth-scopes";
import { oauthResourceIdentifiers } from "@ostiary/core/lib/oauth-resources";
import { withApiScopeBinding, withOpenApiLinks } from "@ostiary/core/lib/oauth-resource-access";
import { CLIENT_MANAGEMENT_HTTP_PATHS, oauthClientGuard } from "@ostiary/core/lib/oauth-client-guard";
import { withWebhookEvents } from "@ostiary/core/lib/webhooks/adapter";
import { ACCESS_TOKEN_EXPIRES_IN, REFRESH_TOKEN_EXPIRES_IN } from "@ostiary/core/lib/oauth-resource-policy";
import { SAML_CLOCK_SKEW_MS, samlResponseRejection } from "@ostiary/core/lib/saml";
import {
    clientExists,
    currentClientRegistrationSettings,
    registrationCapacityLeft,
} from "@ostiary/core/lib/client-registration";
import {
    clientActionAllowed,
    metadataDocumentHostAllowed,
    PLATFORM_CLIENT_REFERENCE,
} from "@ostiary/core/lib/client-registration-policy";
import { socialProvidersConfig } from "@ostiary/core/lib/social-providers";
import {
    KEY_RATE_LIMIT,
    API_KEY_NAME_MAX_LENGTH,
    MAX_LIFETIME_DAYS_LIMIT,
    ORGANIZATION_KEY_CONFIG_ID,
    USER_KEY_CONFIG_ID,
} from "@ostiary/core/lib/api-key-policy";
import { apiKeyVerification } from "@ostiary/core/lib/api-key-verification";
import { DELETED_USER_LABEL } from "@ostiary/core/lib/account-data/erasure";
import { ACCOUNT_DELETION_LINK_MINUTES } from "@ostiary/core/lib/account-data/limits";
import { queueAccountDeletionEmail } from "@ostiary/core/lib/email/queue-account-deletion-email";
import {
    SCIM_DEACTIVATED_MESSAGE,
    SCIM_DEACTIVATED_REASON,
    scimCredentialHashSecret,
    scimIdentity,
    scimProjection,
} from "@ostiary/core/lib/scim";
import { auditRequests } from "@ostiary/core/lib/auth-hooks/audit-hook";
import { databaseHooks, revokeAppAccess } from "@ostiary/core/lib/auth-hooks/database-hooks";
import {
    assertAccountDeletable,
    guardRequests,
    RECENT_SIGN_IN_SECONDS,
} from "@ostiary/core/lib/auth-hooks/request-guards";
import {
    emailCodeTwoFactor,
    externalSignInTwoFactor,
    passwordSignInEvents,
} from "@ostiary/core/lib/auth-hooks/sign-in-plugins";

export { RECENT_SIGN_IN_SECONDS };

/**
 * SSO provider management over HTTP. The admin console manages providers with its own server
 * actions (apps/admin .../sso/actions.ts) after a platform admin check; the plugin's endpoints
 * only check the organization role, so an organization owner could change or delete a provider
 * (or verify its domain) behind the platform admins' back. Only /sso/register stays, guarded
 * by providersLimit (platform admins) and the domain check in request-guards.ts. The shared
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

/**
 * The API key plugin's HTTP endpoints. Keys are created, listed and revoked only through the
 * dashboard's and the admin console's server actions, which apply Ostiary's rules (the global
 * switch, one registered API and its scopes, the maximum lifetime) and write the audit log.
 * The plugin's verification has no HTTP route; APIs use /api-key/verify (api-key-verification.ts).
 */
const API_KEY_PLUGIN_PATHS = ["/api-key/create", "/api-key/get", "/api-key/update", "/api-key/delete", "/api-key/list"];

/**
 * Better Auth's GET link that deletes the account when opened. Ostiary's email links to a page
 * instead (apps/auth .../delete-account), where the signed-in person confirms with a POST to
 * /delete-user carrying the token: a mail scanner opening links cannot delete anyone.
 */
const DELETE_USER_LINK_PATH = "/delete-user/callback";

/** Prefix of new API keys. */
const API_KEY_PREFIX = env.API_KEY_PREFIX ?? "ost_";

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
    // Better Auth reads both from this options object on every call. The plugin's session JWT
    // (GET /token and the set-auth-jwt header) is off: nothing uses it, and it would be signed
    // with the access tokens' key.
    const jwtOptions: JwtOptions = { jwks: {}, disableSettingJwtHeader: true };
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
        // Only platform admins manage clients (create, read, list, update, rotate, delete and
        // client_credentials scopes), from the admin console. Others may only self-register
        // through /oauth2/register, when it is on (see clientActionAllowed).
        clientPrivileges: ({ action, user }) =>
            clientActionAllowed({
                action,
                isAdmin: isPlatformAdmin(user?.role),
                path: tryGetCurrentAuthEndpointContext()?.path,
            }),
        // Clients an admin creates belong to the platform, not to that admin: every admin can
        // manage them, and an admin who loses the role (or the account) no longer can.
        clientReference: ({ user }) => (isPlatformAdmin(user?.role) ? PLATFORM_CLIENT_REFERENCE : undefined),
        // The resource admin endpoints are server-only; this keeps them admin-only as well.
        resourcePrivileges: ({ user }) => isPlatformAdmin(user?.role),
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
        disabledPaths: [
            ...UNUSED_EMAIL_OTP_PATHS,
            ...API_KEY_PLUGIN_PATHS,
            DELETE_USER_LINK_PATH,
            ...SSO_MANAGEMENT_PATHS,
            ...CLIENT_MANAGEMENT_HTTP_PATHS,
            // The jwt plugin's session JWT, see jwtOptions.
            "/token",
        ],
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
        databaseHooks: databaseHooks(),
        hooks: {
            before: guardRequests({ provider, jwtOptions, metadataDocuments }),
            after: auditRequests(),
        },
        // Per-API access: APIs open to every application count as linked to every client.
        // User and membership changes become webhook events once committed (lib/webhooks).
        // API scopes only go into tokens for their own API (withApiScopeBinding).
        database: withApiScopeBinding(withOpenApiLinks(
            withWebhookEvents(
                drizzleAdapter(db, {
                    provider: "pg",
                    schema,
                    // Real transactions (the SCIM plugin refuses to start without them). Better Auth then
                    // runs multi-step writes such as sign-up atomically; after-hooks still run post-commit.
                    transaction: true,
                }),
            ),
        )),
        // The environment's (GitHub); the admin console's are added per request, see syncSocialProviders.
        socialProviders: socialProvidersConfig(),
        account: {
            accountLinking: {
                enabled: true,
                // Explicit "Connect GitHub" from the dashboard may use a different email: the user is
                // signed in and, per request-guards.ts, signed in recently (and not impersonated). Sign-in
                // with GitHub only joins an existing account when GitHub reports that email as verified
                // and the account's own email is verified (Better Auth defaults), and never an account
                // with two-factor authentication or an admin (validateUserInfo below).
                allowDifferentEmails: true,
            },
        },
        session: {
            // Deleting the account and similar actions need a session refreshed in the last
            // 10 minutes (default: a day). Passkeys use the stricter check in request-guards.ts.
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
            // "Delete my account" on the dashboard: password or recent sign-in (request-guards.ts), then
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
            emailCodeTwoFactor(twoFactorPlugin),
            externalSignInTwoFactor(twoFactorPlugin, baseURL),
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
            // admin console (see request-guards.ts). No options here: the endpoint reads Google's
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
                allowUserToCreateOrganization: (user) => isPlatformAdmin(user.role),
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
            // Self-registered clients stay within the self-registration policy; device sign-in
            // is for admin-registered clients only.
            oauthClientGuard(),
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
                domainVerification: { enabled: true, tokenPrefix: SSO_DOMAIN_TOKEN_PREFIX },
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
                providersLimit: (user) => (isPlatformAdmin((user as { role?: string | null }).role) ? 100 : 0),
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
