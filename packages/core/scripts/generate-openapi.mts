/**
 * Writes apps/auth/openapi.json: the OpenAPI schema of the auth endpoints, for the API reference
 * on ostiary.dev/docs/api. A reference configuration, with every optional plugin on, so the
 * schema does not depend on this machine's .env. No database connection is made.
 *
 *   pnpm --filter @ostiary/core openapi          write the file
 *   pnpm --filter @ostiary/core openapi --check  fail if the committed file is out of date (CI)
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = "https://auth.example.com";

// Before any import that reads the environment: env.ts parses process.env when loaded, and
// dotenv never overrides a variable that is already set.
Object.assign(process.env, {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://openapi:openapi@127.0.0.1:1/openapi",
    BETTER_AUTH_SECRET: "openapi-reference-configuration-secret-0000",
    BETTER_AUTH_URL: BASE_URL,
    CAPTCHA_PROVIDER: "cloudflare-turnstile",
    CAPTCHA_SITE_KEY: "site-key",
    CAPTCHA_SECRET_KEY: "secret-key",
    RESEND_API_KEY: "re_reference",
    RESEND_FROM: "Ostiary <auth@example.com>",
    OPENAPI_SCHEMA_ENABLED: "false",
});

const output = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../apps/auth/openapi.json");

// Better Auth's startup work (seeding OAuth resources, and so on) fails without a database and
// logs it: those logs say nothing about the schema.
const quiet = { log: console.log, info: console.info, warn: console.warn, error: console.error };
console.log = console.info = console.warn = console.error = () => {};

const { createAuth } = await import("@ostiary/core/lib/auth-factory");
const auth = createAuth({ baseURL: BASE_URL, trustedOrigins: [BASE_URL] });
const generated = await auth.api.generateOpenAPISchema();
Object.assign(console, quiet);
const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
// Better Auth names a tag after its plugin id: readable names and an order for the reference.
const TAGS: [string, string, string][] = [
    ["Default", "Core", "Email and password sign-up and sign-in, sessions, the user's profile and linked accounts."],
    ["Username", "Username", "Sign-in with a username instead of an email address."],
    ["Email-otp", "Email codes", "Sign-in with a 6-digit code sent by email."],
    ["Passkey", "Passkeys", "WebAuthn passkeys: registration, sign-in and management."],
    ["Two-factor", "Two-factor", "Authenticator app (TOTP), email codes and backup codes as a second step."],
    ["One-tap", "Google One Tap", "Sign-in with Google One Tap, when it is on in the admin console."],
    ["Multi-session", "Multiple accounts", "Several signed-in accounts in one browser."],
    ["Oauth-provider", "OAuth and OpenID Connect", "The authorization server: authorization, tokens, introspection, revocation, UserInfo, consents and client registration."],
    ["Device-authorization", "Device sign-in", "RFC 8628 device authorization grant for CLIs and TVs."],
    ["Jwt", "Signing keys", "The JSON Web Key Set that verifies ID tokens and JWT access tokens."],
    ["Ostiary-api-key-verification", "API keys", "Checks an API key for a resource server."],
    ["Organization", "Organizations", "Organizations, members, roles and invitations."],
    ["Sso", "Enterprise SSO", "OIDC and SAML 2.0 sign-in per organization."],
    ["Scim", "SCIM", "SCIM 2.0 provisioning, authenticated with an organization's SCIM token."],
    ["Admin", "Admin", "User management. Needs a platform admin's session (and two-factor when REQUIRE_ADMIN_2FA is on)."],
];
const tagNames = new Map(TAGS.map(([id, name]) => [id, name]));
type Operation = { tags?: string[]; security?: unknown };
const paths = generated.paths as Record<string, Record<string, Operation>>;
for (const operations of Object.values(paths)) {
    for (const operation of Object.values(operations)) {
        // Better Auth marks every endpoint as needing a bearer token or an API key cookie, sign-in
        // included. Ostiary uses neither (sessions are a cookie, clients authenticate as OAuth
        // says): ostiary.dev/docs/api says which endpoints need what.
        delete operation.security;
        operation.tags = operation.tags?.map((tag) => {
            const name = tagNames.get(tag);
            if (!name) throw new Error(`Unknown OpenAPI tag "${tag}": add it to TAGS in scripts/generate-openapi.mts`);
            return name;
        });
    }
}

const document = generated as Record<string, unknown> & { components: Record<string, unknown> };
delete document.security;
delete document.components.securitySchemes;
const schema = {
    ...document,
    // x-displayName: documentation tools (Fumadocs, Redoc, Scalar) show it as the title.
    tags: TAGS.map(([, name, description]) => ({ name, "x-displayName": name, description })),
    info: {
        title: "Ostiary auth API",
        description:
            "The endpoints of the Ostiary auth app, served under /api/auth. Generated from Better Auth's openAPI plugin with every optional feature on. Admin endpoints need a platform admin's session; client management and API key management are not served over HTTP.",
        version,
    },
};
const json = `${JSON.stringify(schema, null, 2)}\n`;

if (process.argv.includes("--check")) {
    const committed = await readFile(output, "utf8").catch(() => "");
    if (committed !== json) {
        console.error(`${path.relative(process.cwd(), output)} is out of date: run pnpm --filter @ostiary/core openapi`);
        process.exit(1);
    }
} else {
    await writeFile(output, json);
}
process.exit(0);
