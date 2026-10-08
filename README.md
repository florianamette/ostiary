<p align="center">
  <img src=".github/assets/banner.png" alt="Ostiary: one account for all your apps">
</p>

<h1 align="center">Ostiary</h1>

<p align="center">
  <strong>A self-hosted, open-source alternative to Auth0, built on <a href="https://www.better-auth.com">Better Auth</a>.</strong><br>
  One sign-in for all your apps: OAuth 2.1 and OpenID Connect provider, passkeys, enterprise SSO,<br>
  organizations and an admin console. Your users, your database, no per-user pricing.
</p>

<p align="center">
  <a href="https://www.ostiary.dev"><strong>Website</strong></a> ·
  <a href="https://demo.ostiary.dev"><strong>Live demo</strong></a> ·
  <a href="#deploy">Deploy</a> ·
  <a href="#connect-an-app">Connect an app</a>
</p>

<p align="center">
  <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fflorianamette%2Fostiary%2Ftree%2Fmain%2Fapps%2Fauth&project-name=ostiary&repository-name=ostiary&env=BETTER_AUTH_SECRET%2CADMIN_EMAILS%2CRESEND_API_KEY%2CRESEND_FROM&envDescription=BETTER_AUTH_SECRET%3A%2032%2B%20random%20characters%20%28openssl%20rand%20-base64%2032%29.%20ADMIN_EMAILS%3A%20your%20email%2C%20to%20become%20admin%20on%20sign-up.%20RESEND_%2A%3A%20an%20API%20key%20and%20sender%20from%20resend.com%2C%20for%20verification%20emails.&envLink=https%3A%2F%2Fgithub.com%2Fflorianamette%2Fostiary%23configuration&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%5D"><img src="https://vercel.com/button" alt="Deploy with Vercel"></a>
</p>

> In the Middle Ages the *ostiarius* was the doorkeeper: the one who held the keys and decided who came in.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/sign-in-dark.png">
  <img src=".github/assets/sign-in-light.png" alt="The Ostiary sign-in screen">
</picture>

## Why

Hosted identity platforms are great until the bill scales with your users or you need your user data in your own database. Ostiary gives you the same building blocks as a deployable Next.js app you own:

- **Standard protocols.** Any app that speaks OpenID Connect signs in with Ostiary: Next.js, Remix, mobile apps, CLIs, APIs.
- **Your data.** Everything lives in your Postgres database. No vendor lock-in.
- **No per-user pricing.** It costs what your hosting costs.
- **Readable code.** A small TypeScript monorepo on top of [Better Auth](https://www.better-auth.com), not a black box.

## Features

**For your users**

- Email and password with verification, username sign-in, password reset
- Passwordless sign-in with a 6-digit code sent by email (works across devices and inside OAuth sign-ins)
- Optional captcha (Cloudflare Turnstile, hCaptcha or reCAPTCHA v2) on sign-up, password sign-in, password reset and sign-in codes
- Passkeys (WebAuthn), plus a recent sign-in required to add one
- Two-factor authentication: authenticator app (TOTP) and backup codes, with "trust this device"
- Social sign-in (GitHub included; others are a config entry)
- Enterprise SSO (OIDC), with DNS domain verification
- Account dashboard: profile, email change (approved from the current inbox), sessions, passkeys, two-factor authentication, connected accounts, authorized apps

- Account dashboard: profile, email change (approved from the current inbox), sessions, passkeys, connected accounts, authorized apps
- Several accounts in one browser (up to 5): switch from the account menu, or pick one when an app asks with `prompt=select_account`
- 20 locales, light and dark themes

**For your apps**

- OAuth 2.1 / OpenID Connect provider: discovery, PKCE, refresh tokens, consent, UserInfo, introspection, JWKS
- Machine-to-machine tokens (client credentials) with per-client scopes
- Self-registration for MCP clients and AI agents: Dynamic Client Registration and Client ID Metadata Documents, off by default
- Device sign-in (RFC 8628) for CLIs, TVs and other apps without a browser
- Protected resources: JWT access tokens scoped to your APIs, with the user's role as a claim
- Organizations with members, roles and invitations
- SCIM 2.0 provisioning per organization: Okta, Entra ID and other identity providers create and deactivate accounts

**For you (admin console)**

- Users: search, roles, bans, sessions, impersonation, two-factor reset
- OAuth clients with usage statistics, consents, organizations, SSO providers
- Audit log of every admin action, sign-in activity and failed sign-in monitoring
- Signing keys: automatic rotation on a schedule, or rotate now, with a grace period during which old tokens keep verifying
- Rate limits per client IP on sign-in, codes, password reset and token endpoints, counted in Postgres so they hold on serverless

## How it compares

| | Ostiary | Auth0 |
| --- | --- | --- |
| Hosting | Your Vercel account and Postgres | Auth0 cloud |
| Pricing | Your infrastructure | Per monthly active user |
| OIDC / OAuth 2.1 provider | Yes | Yes |
| Passkeys, two-factor authentication, social sign-in, organizations | Yes | Yes |
| Enterprise SSO | OIDC (SAML via Better Auth) | OIDC and SAML |
| Admin console and audit log | Yes | Yes |
| SCIM, breached-password detection, compliance certifications | Not yet | Yes |
| Source code | Yours, MIT | Closed |

Ostiary is a good fit when you want to own your identity layer. If you need a managed service with compliance certifications and an SLA, a hosted platform is the better choice.

## Deploy

1. Click **Deploy with Vercel** above. Vercel creates a Neon Postgres database for you and asks for:
   - `BETTER_AUTH_SECRET`: 32+ random characters (`openssl rand -base64 32`)
   - `ADMIN_EMAILS`: your email address, so your account becomes an admin when you sign up
   - `RESEND_API_KEY` and `RESEND_FROM`: from [resend.com](https://resend.com), to send verification emails
2. The build applies the database migrations. When it finishes, open your deployment and sign up with the email you put in `ADMIN_EMAILS`. The admin console asks you to turn on two-factor authentication before you use it.
3. Optional: deploy the admin console as a second project with the same database and secret:

   <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fflorianamette%2Fostiary%2Ftree%2Fmain%2Fapps%2Fadmin&project-name=ostiary-admin&repository-name=ostiary&env=DATABASE_URL%2CBETTER_AUTH_SECRET%2CAUTH_APP_URL%2CADMIN_APP_URL%2CRESEND_API_KEY%2CRESEND_FROM&envDescription=Use%20the%20same%20DATABASE_URL%20and%20BETTER_AUTH_SECRET%20as%20your%20Ostiary%20auth%20app.%20AUTH_APP_URL%3A%20its%20URL.%20ADMIN_APP_URL%3A%20this%20app%27s%20URL.&envLink=https%3A%2F%2Fgithub.com%2Fflorianamette%2Fostiary%23configuration"><img src="https://vercel.com/button" alt="Deploy the admin console"></a>

   For a single sign-in across both apps, give them subdomains of one domain (for example `auth.example.com` and `admin.example.com`) and set `COOKIE_DOMAIN=.example.com` on both.

## Connect an app

Ostiary is a standard OpenID Connect provider. Register a client in the admin console (**Applications**), then point your app at the discovery document:

```
https://<your-ostiary-domain>/api/auth/.well-known/openid-configuration
```

For example, with [Auth.js](https://authjs.dev) in a Next.js app:

```ts
import NextAuth from "next-auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    {
      id: "ostiary",
      name: "Ostiary",
      type: "oidc",
      issuer: "https://auth.example.com/api/auth",
      clientId: process.env.OSTIARY_CLIENT_ID,
      clientSecret: process.env.OSTIARY_CLIENT_SECRET,
    },
  ],
});
```

Any OIDC library works the same way (Better Auth's generic OAuth, `openid-client`, AppAuth on mobile): give it the issuer, client ID and secret.

To protect an API, register it in the admin console under **APIs**: its identifier (usually its URL) and the scopes clients may request for it. Clients request a token for it with the `resource` parameter, and the API verifies the JWT against Ostiary's JWKS. New scopes reach the auth server within a minute, no redeploy needed. You can also declare APIs with `OAUTH_API_AUDIENCES` and scopes with `OAUTH_API_SCOPES`, for example to provision a new instance.

Every application can get tokens for an API by default. To limit an API to some applications, open **Change** next to *Applications* and pick **Only linked applications**, then check the applications that may call it; the others get `invalid_target`. Linked applications can also introspect the API's tokens. **Change** next to *Tokens* sets the API's access and refresh token lifetimes (shorter than the defaults of 1 hour and 30 days), custom claims added to its tokens (a JSON object, e.g. `{"tenant": "acme"}`), and whether tokens must be DPoP-bound, in which case the API must check the DPoP proof.

### Signing keys and rotation

ID tokens and JWT access tokens are signed with an Ed25519 key; apps and APIs verify them against the public keys at `https://<your-ostiary-domain>/api/auth/jwks` (the `jwks_uri` of the discovery document). The admin console's **Signing keys** page lists the keys (key ID, algorithm, dates and whether each one is current, still published for verification, or expired) and never shows private keys, which are stored encrypted with `BETTER_AUTH_SECRET`.

- **Rotate now** creates a new key that signs every token from then on. The previous key stays in the JWKS for the grace period, so tokens it signed keep verifying until they expire.
- **Automatic rotation** (off by default) replaces the key every 30, 90, 180 or 365 days. The new key is created when the first token is signed after the current one reaches that age.
- **Grace period** (default 30 days, as before): how long a retired key stays published. Keep it longer than your longest token lifetime (access tokens: 1 hour, ID tokens: 10 hours).

Settings reach the auth server within a minute. Rotation needs nothing from your apps as long as they read keys from the JWKS by `kid` and fetch it again when they meet an unknown one, as `jose`'s `createRemoteJWKSet`, `openid-client`, Auth.js and Better Auth do. Apps that pin a single public key must be updated after each rotation.

### Sign in from a CLI or a TV (device flow)

Apps that cannot open a browser use the device authorization grant (RFC 8628). In the admin console, register the app (usually a public client) and tick **Device sign-in**. The discovery document then lists `device_authorization_endpoint`.

1. The app asks for a code:

   ```bash
   curl -s https://auth.example.com/api/auth/device/code \
     -d client_id=$CLIENT_ID \
     -d scope="openid profile email offline_access"
   # {"device_code":"…","user_code":"WDJBMJHT","verification_uri":"https://auth.example.com/device",
   #  "verification_uri_complete":"https://auth.example.com/device?user_code=WDJBMJHT","expires_in":600,"interval":5}
   ```

2. It shows `user_code` (for example as WDJB-MJHT, the dash is optional) and `verification_uri` (or a QR code of `verification_uri_complete`). The user opens the page, signs in if needed, checks the app and the scopes, and approves.

3. Meanwhile the app polls the token endpoint every `interval` seconds:

   ```bash
   curl -s https://auth.example.com/api/auth/oauth2/token \
     -d grant_type=urn:ietf:params:oauth:grant-type:device_code \
     -d device_code=$DEVICE_CODE \
     -d client_id=$CLIENT_ID
   ```

   Until the user decides it gets `authorization_pending` (or `slow_down` when it polls too fast: wait 5 more seconds). Then it gets the usual tokens (access token, ID token with `openid`, refresh token with `offline_access`), or `access_denied`. After 10 minutes the code expires (`expired_token`) and the app starts again. A confidential client also sends its secret on both requests.

The user always approves on the page, even for clients with **Skip consent**.

## Provision users with SCIM

An organization's identity provider can create its people's accounts and deactivate them when they leave. In the admin console, open the organization and, under **SCIM provisioning**, choose **Generate token**. Copy the base URL and the token (it is shown once and expires after a year).

**Okta**: in your app integration, **General** > enable **SCIM provisioning**. Under **Provisioning** > **Integration**:

- SCIM connector base URL: the base URL, e.g. `https://auth.example.com/api/auth/scim/v2`
- Unique identifier field for users: `userName`
- Supported provisioning actions: Push New Users, Push Profile Updates (and Push Groups if you use them)
- Authentication mode: **HTTP Header**, Authorization: the token

Then under **Provisioning** > **To App**, enable Create Users, Update User Attributes and Deactivate Users, and assign people to the app.

**Microsoft Entra ID**: in your enterprise application, **Provisioning** > **New configuration** (or set Provisioning Mode to **Automatic**):

- Tenant URL: the base URL
- Secret token: the token

Choose **Test connection**, save, assign users and groups, and start provisioning. Entra ID sends the email in `userName`; the default attribute mappings work as they are.

Google Workspace only provisions to apps from its catalog, so it can't push to Ostiary directly; use its SSO and invite people instead, or sync Google to Okta or Entra ID first.

What happens to accounts:

- A new person gets an account in the organization (and the Public workspace). They sign in with the organization's SSO, or set a password with "Forgot password".
- An existing account is only linked when its email is verified and the organization has verified that email domain for SSO. Otherwise the identity provider gets a conflict (409): it can't take over an account by naming its address. Platform admins are never linked.
- Deactivating (`active: false`) or deleting a person keeps the account but bans it, signs it out everywhere and revokes its OAuth tokens. Reactivating lifts that ban (never one set by an admin). Deleting also removes them from the organization unless they are an owner or admin there.
- **New token** replaces the token at once; **Revoke** stops provisioning and leaves accounts as they are. Both are in the audit log.

## Use Ostiary with MCP / AI agents

MCP clients (Claude, VS Code, Cursor, agent frameworks) register themselves with the authorization server instead of waiting for an admin to create a client. Ostiary supports both ways they do it. Both are **off by default**: turn them on in the admin console, **Applications > Self-registration**.

- **Dynamic Client Registration** (RFC 7591): the client posts its metadata to `/api/auth/oauth2/register` and gets a `client_id`. Choose *Anyone* (what MCP clients expect) or *Signed-in users only*.
- **Client ID Metadata Documents**: the `client_id` is an HTTPS URL to the client's JSON metadata, for example `https://vscode.dev/oauth/client-metadata.json`. Ostiary fetches it the first time the client signs someone in. You can limit it to some hosts (`claude.ai`, `vscode.dev`).

Self-registered clients are never reviewed, so Ostiary limits them:

- They may only request the scopes you tick in the settings (OpenID Connect scopes by default; add your API scopes as needed). Narrowing the list also narrows clients registered before.
- Authorization code with PKCE only: no client credentials, no device sign-in, no skipping the consent screen.
- The consent screen marks them as **unverified**, says where the user will be sent, and hides their logo.
- An hourly cap on new self-registered clients across all instances (30 by default), plus Better Auth's limit of 5 registrations a minute per IP address in production. Metadata documents are fetched only from public addresses (no private or reserved IPs, no redirects, 5 KB, 5 s timeout).
- The Applications page lists them with a badge and a filter; you can disable or delete them. Registrations and admin changes are in the audit log.

Settings live in the database and reach the auth server within a minute, no redeploy needed.

**Discovery.** When registration is on, the discovery documents advertise it (`registration_endpoint`, and `client_id_metadata_document_supported` for metadata documents). The issuer is `https://auth.example.com/api/auth`, so MCP clients find the metadata at:

```
https://auth.example.com/.well-known/oauth-authorization-server/api/auth
https://auth.example.com/api/auth/.well-known/openid-configuration
```

**Register a client** (what an MCP client does for you):

```bash
curl -X POST https://auth.example.com/api/auth/oauth2/register \
  -H 'content-type: application/json' \
  -d '{
    "client_name": "My Agent",
    "redirect_uris": ["http://127.0.0.1:33418/callback"],
    "token_endpoint_auth_method": "none",
    "application_type": "native",
    "grant_types": ["authorization_code", "refresh_token"],
    "scope": "openid profile email offline_access"
  }'
# 201 {"client_id": "...", "scope": "openid profile email offline_access", ...}
```

A web (`"application_type": "web"`) client needs HTTPS redirect URIs and gets a `client_secret` unless it registers with `"token_endpoint_auth_method": "none"`. The client then runs the usual authorization code flow with PKCE.

**Publish a metadata document** instead (served as `application/json` at the URL that is its `client_id`):

```json
{
  "client_id": "https://agent.example.com/oauth/client.json",
  "client_name": "My Agent",
  "redirect_uris": ["https://agent.example.com/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none"
}
```

**Protect an MCP server (or any API).** Register it under **APIs** with its URL as identifier (for example `https://mcp.example.com`) and its scopes, and allow those scopes for self-registered clients. The MCP server then points clients to Ostiary with OAuth Protected Resource Metadata (RFC 9728): it serves `/.well-known/oauth-protected-resource` and answers unauthenticated requests with `401` and a `WWW-Authenticate` header that links to it. Clients request their token with `resource=https://mcp.example.com`, so its audience is your server. With Better Auth's resource client:

```ts
import { createAuthClient } from "better-auth/client";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";

const ISSUER = "https://auth.example.com/api/auth";
const RESOURCE = "https://mcp.example.com";
const ostiary = createAuthClient({ baseURL: ISSUER, plugins: [oauthProviderResourceClient()] });

// GET /.well-known/oauth-protected-resource
export function protectedResourceMetadata() {
  return Response.json({
    resource: RESOURCE,
    authorization_servers: [ISSUER],
    scopes_supported: ["notes:read", "notes:write"],
    bearer_methods_supported: ["header"],
  });
}

// Every MCP request: verifies the JWT (signature, issuer, audience, scopes). On failure it
// throws a 401 whose WWW-Authenticate header carries resource_metadata=".../.well-known/oauth-protected-resource".
export async function requireToken(request: Request) {
  return ostiary.verifyAccessTokenRequest(request, {
    verifyOptions: { issuer: ISSUER, audience: RESOURCE },
    jwksUrl: `${ISSUER}/jwks`,
    requiredScopes: ["notes:read"],
  });
}
```

## Run locally

Requirements: Node.js 20+, pnpm 11, a Postgres database.

```bash
pnpm install
cp apps/auth/.env.example apps/auth/.env.local     # fill in DATABASE_URL and BETTER_AUTH_SECRET
cp apps/admin/.env.example apps/admin/.env.local   # same DATABASE_URL and BETTER_AUTH_SECRET
pnpm db:migrate
pnpm dev:auth     # http://localhost:3000
pnpm dev:admin    # http://localhost:3001
```

Without Resend configured, development prints verification and reset links, and sign-in codes, to the console.

## Configuration

| Variable | App | Required | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | both | yes | Postgres connection string (the same for both apps) |
| `BETTER_AUTH_SECRET` | both | yes | 32+ characters, the same for both apps |
| `RESEND_API_KEY`, `RESEND_FROM` | both | in production | Sending verification, reset and invitation emails |
| `ADMIN_EMAILS` | auth | first run | Emails that become admins when they sign up |
| `REQUIRE_ADMIN_2FA` | both | optional | `true` (default): admins must turn on two-factor authentication before using the admin console. `false` turns this off |
| `AUTH_APP_URL`, `ADMIN_APP_URL` | both | admin console | The two apps' public URLs |
| `NEXT_PUBLIC_ADMIN_APP_URL` | auth | admin console | Shows the "Admin" link in the account menu |
| `COOKIE_DOMAIN` | both | admin console | Parent domain shared by both apps, e.g. `.example.com` |
| `OAUTH_API_AUDIENCES` | both | optional | Comma-separated URLs of your APIs, registered at build time (or use the admin console) |
| `OAUTH_API_SCOPES` | both | optional | Comma-separated scopes available to every API (or declare them per API in the admin console) |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | auth | optional | "Sign in with GitHub" |
| `SCIM_TOKEN_SECRET` | both | optional | 32+ characters to hash SCIM tokens with; derived from `BETTER_AUTH_SECRET` when unset. Changing either invalidates SCIM tokens |
| `RATE_LIMIT_ENABLED` | both | optional | Rate limiting of the auth endpoints, see [Rate limiting](#rate-limiting). Default: on in production, off in development. `false` turns it off |
| `IP_ADDRESS_HEADERS` | both | optional | Comma-separated headers holding the client IP, tried in order. Default `x-forwarded-for` (right on Vercel). See [Client IP](#client-ip) |
| `TRUSTED_PROXIES` | both | optional | Comma-separated IPs or CIDR ranges of your own reverse proxies, to read the client IP from a multi-hop `x-forwarded-for` |
| `CAPTCHA_PROVIDER`, `CAPTCHA_SITE_KEY`, `CAPTCHA_SECRET_KEY` | auth | optional | Captcha on sign-up, password sign-in, password reset and sign-in codes. Provider: `cloudflare-turnstile`, `hcaptcha` or `google-recaptcha` (v2 checkbox). Set all three or none, before building (the CSP is built with them) |

**Rebrand** by editing `packages/core/src/lib/brand.ts` (name, tagline, colors, logo geometry) and the matching tokens in `packages/core/src/styles/globals.css`, then run `pnpm --filter @ostiary/auth brand:assets` to regenerate `logo.png` and `logo.svg`.

## Architecture

```
apps/auth       Sign-in, sign-up, consent, OIDC endpoints, account dashboard
apps/admin      Admin console (optional): users, clients, organizations, SSO, audit
packages/core   Better Auth configuration, database schema and migrations, emails, UI, translations
```

Both apps run the same Better Auth configuration against one database. The admin app only exposes an allowlist of auth endpoints; sign-in and the OIDC protocol stay on the auth app.

## Security

- Email changes need approval from the current inbox; a stolen session alone cannot move an account.
- Adding a passkey or connecting an account needs a sign-in from the last 10 minutes.
- Two-factor authentication (authenticator app or backup code) applies to password sign-ins and emailed sign-in codes. Passkeys are already two factors; GitHub and SSO sign-ins rely on that provider's own checks. Backup codes and authenticator secrets are stored encrypted.
- Admins must turn on two-factor authentication (`REQUIRE_ADMIN_2FA`). An admin without it is sent to set it up and cannot use the console or the admin endpoints until then; their own account keeps working. An admin who loses their authenticator and backup codes can have another admin reset it from the user's page (audited).
- Sign-in codes open existing accounts only (an unknown address gets the same answer and no email), expire after 10 minutes, are stored hashed and are void after 3 wrong tries. On an account whose email was never verified, the first code verifies it and removes the unproven password and sessions.
- Only admins can create organizations and register SSO providers; SSO domains must be verified with a DNS record.
- SCIM tokens are stored as HMAC digests and can only be issued by platform admins; each one only reaches its own organization.
- Token signing keys can be rotated on a schedule or on demand (**Signing keys**); retired keys stay published only for the grace period. Rotations and setting changes are in the audit log.
- The audit log never stores passwords, secrets or session tokens.
- Sign-in, codes, password reset and the token endpoint are rate limited per client IP, see below.

### Rate limiting

Better Auth counts requests per client IP and endpoint. Ostiary keeps the counts in Postgres (table `rate_limit`, migration `0005_rate_limit`) instead of each server's memory: on Vercel every function instance has its own memory, so in-memory limits barely apply. It is on in production and off in development; set `RATE_LIMIT_ENABLED=true` to try it locally.

A refused request gets `429 Too Many Requests` with a `Retry-After` header (seconds) and `{"code": "RATE_LIMITED", "retryAfter": 42, "message": "..."}`. The sign-in, code, two-factor and device screens show "Try again in 42 seconds" in the user's language. A rule allows `max` requests, then refuses until `window` seconds have passed since the last allowed one.

| Endpoint | Limit per IP | Why |
| --- | --- | --- |
| `/sign-in/email`, `/sign-in/username` | 10 per minute | Password guessing; room for several people behind one address |
| `/sign-up/email` | 10 per 5 minutes | Each sends a verification email |
| `/request-password-reset`, `/send-verification-email` | 5 per 10 minutes | Each sends an email to any address |
| `/email-otp/send-verification-otp`, `/sign-in/email-otp` | 3 per minute | Sign-in codes (also void after 3 wrong tries) |
| `/two-factor/verify-totp`, `/verify-backup-code`, `/verify-otp` | 5 per minute | Second step; the account also locks after repeated wrong codes |
| `/device` (code lookup) | 5 per 10 minutes | Device user codes |
| `/device/approve`, `/device/deny` | 10 per minute | |
| `/oauth2/token` | 300 per minute | Machine clients, refreshes and device polling share server addresses; every credential it takes is long and random |
| `/oauth2/register` | 5 per minute | Plus the hourly cap set in the admin console |
| `/oauth2/authorize`, `/oauth2/userinfo`, `/oauth2/introspect` | 30, 60, 100 per minute | Better Auth's OAuth provider defaults |
| `/get-session`, `/jwks` | none | Hot, read-only, nothing to guess |
| Anything else | 100 per 10 seconds | Better Auth's default |

The rules are in `packages/core/src/lib/rate-limit.ts`. Limits are per address, so an office or a classroom behind one IP shares them: raise a rule there if your users sign in from large shared networks.

**Table size.** One row per client IP and endpoint. When a counter's window ends, Better Auth deletes the rows not used for longer than the longest window (10 minutes), so the table holds roughly the addresses seen in the last 10 minutes; no cron job is needed. Each counted request costs two small queries (read, then a conditional update or insert).

**Redis (optional, not built in).** For heavy traffic, Better Auth can keep the counts in a key-value store instead: pass `secondaryStorage` (with an atomic `increment`, e.g. Upstash Redis) to `betterAuth()` and set `rateLimit.storage: "secondary-storage"` in `packages/core/src/lib/auth-factory.ts`. Note that `secondaryStorage` also moves sessions and verification values out of Postgres.

### Client IP

Rate limits (and the IP stored with sessions) need the real client address. By default Better Auth reads `x-forwarded-for` and trusts it only when it holds a single address.

- **Vercel**: nothing to set. Vercel overwrites `x-forwarded-for` with the client's address, so clients cannot spoof it.
- **Behind Cloudflare**: `IP_ADDRESS_HEADERS=cf-connecting-ip` (only if the origin accepts traffic from Cloudflare alone).
- **Behind nginx, a load balancer or several proxies** that append to `x-forwarded-for`: set `TRUSTED_PROXIES` to their addresses (e.g. `10.0.0.0/8`). The client IP is then the right-most address that is not a trusted proxy. Or have the proxy overwrite a header (`proxy_set_header X-Real-IP $remote_addr;`) and set `IP_ADDRESS_HEADERS=x-real-ip`.
- **Exposed directly, no proxy**: clients control every header. Put a proxy in front, or limits can be dodged by sending a different `x-forwarded-for` each time.

Never name a header your proxy passes through from the client: anyone could then pick their own IP. When no trusted address is found, all such requests share a single counter per endpoint, and Better Auth logs a warning.

Found a vulnerability? Please email the maintainer rather than opening a public issue.

## In production

[Cyber Auth](https://www.cyberauth.co), the single sign-on for the Cyber ecosystem (CyberCTF, Cyber Courses, Cyber Bench), runs on Ostiary.

## Credits

Built on [Better Auth](https://www.better-auth.com) (MIT). Ostiary is a community project and is not affiliated with Better Auth. Type: [Instrument Sans and Instrument Serif](https://github.com/Instrument) and [Geist Mono](https://vercel.com/font) (SIL Open Font License).

## License

[MIT](LICENSE) © Florian Amette
