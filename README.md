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
- Social sign-in with every Better Auth provider (Google, Apple, Microsoft, GitHub and 32 more), set up from the admin console, with brand buttons and connected accounts, plus Google One Tap
- Enterprise SSO with OIDC or SAML 2.0 (Okta, Entra ID, Google Workspace, JumpCloud), with DNS domain verification
- Account dashboard: profile, email change (approved from the current inbox), sessions, passkeys, two-factor authentication, connected accounts, connected apps (with their icons, permissions in plain words, when they were connected and last used)

- Account dashboard: profile, email change (approved from the current inbox), sessions, passkeys, connected accounts, authorized apps
- Several accounts in one browser (up to 5): switch from the account menu, or pick one when an app asks with `prompt=select_account`
- 20 locales, light and dark themes

**For your apps**

- OAuth 2.1 / OpenID Connect provider: discovery, PKCE, refresh tokens, consent, UserInfo, introspection, JWKS
- Machine-to-machine tokens (client credentials) with per-client scopes
- API keys for scripts: users (or organizations) create keys for one of your APIs and some of its scopes; your API verifies them with Ostiary
- Self-registration for MCP clients and AI agents: Dynamic Client Registration and Client ID Metadata Documents, off by default
- Device sign-in (RFC 8628) for CLIs, TVs and other apps without a browser
- Protected resources: JWT access tokens scoped to your APIs, with the user's role as a claim
- Organizations with members, roles and invitations
- SCIM 2.0 provisioning per organization: Okta, Entra ID and other identity providers create and deactivate accounts

**For you (admin console)**

- Users: search, roles, bans, sessions, impersonation, two-factor reset
- Sign-in providers: turn social sign-in providers on and off, order them and paste their credentials (stored encrypted) without a redeploy
- Sign-in branding per application: display name, logo, accent color (with WCAG contrast checks), tagline, side panel and which social buttons show, with a live preview
- OAuth clients with their icons, an **App usage** page (tokens, users and consents per app over 30 days), consents, organizations, SSO providers
- API keys: turn them on, set their maximum lifetime, see and revoke every key
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
| Enterprise SSO | OIDC and SAML 2.0 | OIDC and SAML |
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

### Brand the sign-in page per app

When someone arrives from one of your apps, the sign-in screens can show that app, like
Auth0's per-application Universal Login: "Sign in to continue to **Cyber Library**", its logo,
its accent color on the buttons and focus ring, and an optional tagline. On wide screens the
dark side panel can show the app's own headline and background image. Without an app (someone
opening `/login` directly) the screens keep the global brand from `lib/brand.ts`.

Set it in the admin console: **Applications**, the row's menu, **Sign-in branding**.

- **Display name**: replaces the client name on the sign-in screens and the consent card.
- **Logo**: the app's icon (as on the consent screen), an https URL, or an upload (PNG, JPEG,
  WebP, AVIF, GIF, ICO or SVG, 256 KB). A URL is fetched by Ostiary with the same SSRF guard as
  app icons and cached in `app_icon`; uploads are stored in the database. Browsers only ever
  load `/api/app-branding/<client_id>/logo` from Ostiary, never from the app's servers.
- **Accent color**: a hex color. The console shows its contrast: button labels get black or
  white, whichever reaches WCAG AA (one always does); text in the accent is darkened or
  lightened per color scheme until it reaches 4.5:1; and it warns when the buttons themselves
  are below 3:1 against the light or dark card.
- **Side panel**: a headline and an image (PNG, JPEG, WebP or AVIF, 1 MB).
- **Social sign-in**: all enabled providers, or only some (Google One Tap follows Google). This
  only hides buttons on that app's screens; it does not stop other sign-in methods.

Changes are written to the audit log (**Changed sign-in branding**, **Reset sign-in
branding**). Settings live in the `oauth_client_branding` table, deleted with the client.

**Which app a screen is for.** Better Auth's OAuth provider sends the browser to `/login`,
`/consent` and `/select-account` with the authorization request in the query, signed with
`BETTER_AUTH_SECRET` (`sig`, with `exp` and the list of signed parameters in `ba_param`).
Ostiary checks that signature and that `client_id` is one of the signed parameters before
showing any app; a `?client_id=` typed into a link, or a signed request with its `client_id`
edited, shows the default screen. Sign-up, password reset and the email links get a short-lived
app context token instead (`app=`, HMAC-signed with a key derived from the same secret, 2
hours) plus `callbackURL` set to the authorization request, so the flow continues after the
email step: verifying a new account or resetting a password brings the user back to the app.
The two-factor step keeps the signed request, the email-code step is part of the login page,
and the device page shows the app once the code names a pending request.

**Anti-phishing.** Only clients registered by an admin get custom branding. A client that
registered itself (Dynamic Client Registration or a metadata document) gets its name with an
**Unverified app** warning and a monogram, whatever is stored. Ostiary's own mark stays at the
top of every screen and "Secured by Ostiary" at the bottom, so people can tell which identity
provider they are typing their password into, and the side panel keeps the Ostiary theme.

**Forks with their own theme.** The accent reaches the form column only, through four CSS
variables on `[data-app-brand="accent"]` (see `styles/globals.css`): `--app-accent`,
`--app-accent-foreground`, `--app-accent-text-light` and `--app-accent-text-dark`, mapped to
`--primary`, `--primary-foreground` and `--ring`. Override that block to change what the accent
reaches, or empty it to ignore app accents. Contrast is computed against Ostiary's card colors
(`#ffffff` light, `#141311` dark); a fork with very different cards should check its own.

## Social sign-in

Every social provider Better Auth ships can be turned on from the admin console, under **Sign-in providers**, without a redeploy:

1. Open the provider and copy its **callback URL**: `https://auth.example.com/api/auth/callback/<id>`.
2. Create an OAuth app with the provider (**Create the app** links to its console), register the callback URL, and paste the credentials.
3. Leave **Show on the sign-in page** on and save. The sign-in, sign-up and account pages show it within 30 seconds; turning it off removes the button and refuses its sign-ins and callbacks.

Secrets are stored encrypted and never shown again (you can replace them). **Create accounts for new users** off lets the provider sign in existing accounts only. Users connect and disconnect providers from **Connected accounts** in their dashboard (never their last way to sign in). `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` keep working and take precedence over the console. Changing `BETTER_AUTH_SECRET` makes stored provider secrets unreadable: the console then asks for them again.

| Provider | Id | Fields (besides the client ID and secret, unless stated) |
| --- | --- | --- |
| Apple | `apple` | Services ID, Team ID, Key ID and the `.p8` private key (the client secret JWT is generated and renewed for you); optional app bundle ID for native iOS. Needs HTTPS |
| Atlassian | `atlassian` | - |
| Cloudflare | `cloudflare` | Client secret optional (PKCE public client) |
| Amazon Cognito | `cognito` | Cognito domain, region, user pool ID; client secret optional |
| Discord | `discord` | - |
| Dropbox | `dropbox` | App key and secret |
| Facebook | `facebook` | App ID and secret |
| Figma | `figma` | - |
| GitHub | `github` | Or `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` |
| GitLab | `gitlab` | Optional GitLab URL (self-managed) |
| Google | `google` | Optional Workspace domain (`hd`) to accept only that domain |
| Hugging Face | `huggingface` | - |
| Kakao | `kakao` | REST API key; client secret optional |
| Kick | `kick` | - |
| LINE | `line` | Channel ID and secret |
| Linear | `linear` | - |
| LinkedIn | `linkedin` | - |
| Microsoft (Entra ID) | `microsoft` | Optional tenant: `common` (default), `organizations`, `consumers` or a tenant ID |
| Naver | `naver` | - |
| Notion | `notion` | - |
| Paybin | `paybin` | Optional issuer |
| PayPal | `paypal` | Environment: `live` or `sandbox` |
| Polar | `polar` | - |
| Railway | `railway` | - |
| Reddit | `reddit` | - |
| Roblox | `roblox` | - |
| Salesforce | `salesforce` | Environment (`production` or `sandbox`), optional My Domain host |
| Slack | `slack` | - |
| Spotify | `spotify` | - |
| TikTok | `tiktok` | Client key instead of a client ID |
| Twitch | `twitch` | - |
| X (Twitter) | `twitter` | OAuth 2.0 client ID and secret |
| Vercel | `vercel` | - |
| VK | `vk` | App ID and protected key |
| WeChat | `wechat` | AppID and AppSecret (website app; no email) |
| Zoom | `zoom` | - |

With a few providers the sign-in page shows a full-width button for each; from four, a grid with names; from seven, a grid of logos with tooltips. The provider used last on that device keeps its full-width button.

### Google One Tap

Google's own prompt ("Sign in as …", the browser's FedCM dialog in Chrome) for people already signed in to Google in their browser. Turn on **Show Google One Tap** in Google's settings under **Sign-in providers**; it works only while Google itself is on, and uses the same client ID, Workspace domain (`hd`) and **Create accounts for new users** setting.

- **Google Cloud console**: add the auth app's origin (e.g. `https://auth.example.com`, and `http://localhost:3000` for local tests) to the OAuth client's **Authorized JavaScript origins**. Without it Google refuses the prompt (the redirect URI alone is not enough). A real test needs that client and a browser signed in to Google: with any other client ID the script loads but no account is offered.
- **Where**: the sign-in and sign-up pages only, never consent, account or admin pages. Not shown when someone is already signed in (or adding another account), nor when this device last signed in another way (password, passkey, code, another provider): those people get the method they use. Dismissed, blocked or unsupported, it simply does not appear.
- **What happens**: Better Auth's `oneTap` plugin checks the ID token (Google's signature, issuer, audience = your client ID, at most an hour old, and `hd` when set) at `POST /api/auth/one-tap/callback`, then signs in exactly like **Continue with Google**: same account linking, last-used method (Google), sign-in history, and a pending authorization for an app resumes. The endpoint answers 404 while One Tap is off.
- **Content Security Policy**: the sign-in and sign-up pages also allow `https://accounts.google.com/gsi/client` (script), `/gsi/style` (style), and `/gsi/` (frames and requests). Other pages keep the stricter policy.

## Enterprise SSO with SAML 2.0

An organization's identity provider can be OIDC or SAML 2.0, registered in the admin console under **SSO** (pick the **SAML 2.0** tab). People then use **Sign in with SSO** on the login page: their email domain picks the provider, Ostiary sends them to the identity provider and they come back signed in. SAML runs on Better Auth's `@better-auth/sso` plugin (samlify underneath); Ostiary adds the admin console, checks on the IdP metadata and a guard in front of the ACS.

**Service provider values** (shown with copy buttons on the form and under **SP details** for each provider; `<id>` is the provider ID):

| | |
| --- | --- |
| ACS URL (single sign-on URL, reply URL) | `https://auth.example.com/api/auth/sso/saml2/sp/acs/<id>` |
| SP entity ID (audience URI, identifier) | `https://auth.example.com/api/auth/sso/saml2/sp/metadata?providerId=<id>` |
| SP metadata URL | same as the entity ID |

**The identity provider** is given as a metadata URL (fetched once by the server when you save, with the webhook SSRF guard: https, public addresses only, 100 KB, 10 s), pasted metadata XML, or by hand (IdP entity ID, HTTP-Redirect SSO URL, signing certificate). The metadata must describe one IdP with an HTTP-Redirect SSO endpoint and a valid signing certificate, and no DOCTYPE. After a certificate rotation, open **Edit** and give the new metadata; the provider list shows when the certificate expires.

**Attribute mapping**: email and display name are required, first and last name optional (used when sent). Presets fill in the names for Okta, Microsoft Entra ID (its default claim URIs), Google Workspace and JumpCloud. The user ID is always the assertion's NameID: use a persistent identifier.

**Okta**

1. Applications, **Create App Integration**, **SAML 2.0**.
2. Single sign-on URL: the ACS URL. Audience URI (SP Entity ID): the SP entity ID. Name ID format: Persistent. Application username: Email.
3. Attribute statements: `email` = `user.email`, `firstName` = `user.firstName`, `lastName` = `user.lastName` (the Okta preset).
4. Assign people, then paste the metadata URL from the **Sign On** tab into Ostiary.

**Microsoft Entra ID**

1. **Enterprise applications**, **New application**, **Create your own application** (non-gallery), then **Single sign-on**, **SAML**.
2. Basic SAML configuration: Identifier (Entity ID) = the SP entity ID, Reply URL = the ACS URL.
3. Keep the default claims (the Entra ID preset). The default signing option, *Sign SAML assertion*, works.
4. Assign users and groups, then paste the **App Federation Metadata URL** into Ostiary.

Google Workspace (Apps, Web and mobile apps, Add custom SAML app) and JumpCloud work the same way: enter the ACS URL and entity ID, add the email, first name and last name attributes, and paste the IdP metadata.

As with OIDC, a provider takes sign-ins only once its email domain is verified with a DNS TXT record (**Verify domain**). Registrations, edits and deletions are in the audit log.

**What is checked on every response**: an XML signature by the IdP's certificate (unsigned responses are always refused; with **Require signed assertions**, the default, the assertion itself must be signed), the audience (SP entity ID), the bearer `Recipient` and the `Destination` (when present) against the ACS URL, the issuer, `InResponseTo` against an AuthnRequest this server sent in the last 5 minutes (each usable once), each assertion ID once (replay), `NotBefore`/`NotOnOrAfter` required with 1 minute of clock skew, exactly one assertion, SHA-256 or stronger (SHA-1 is refused), no DOCTYPE or entity declarations, 256 KB at most.

**Not supported**: IdP-initiated sign-in (unsolicited responses are refused; point the IdP's app tile at `https://auth.example.com/sso`), signed AuthnRequests (leave request signing off in the IdP), encrypted assertions and single logout.

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

## Webhooks

Apps can be told when users change instead of polling. In the admin console, **Webhooks** > **Add an endpoint**: an HTTPS URL and the events to send. Copy the signing secret it shows (once; **Regenerate secret** makes a new one, and for 24 hours deliveries are signed with both).

Events: `user.created`, `user.updated` (name, email, email verification, username, picture), `user.deleted`, `user.banned`, `user.unbanned` (SCIM deactivation and reactivation count, with `"source": "scim"`), `user.role_changed`, `organization.member.added`, `organization.member.removed`, `organization.member.role_changed`. **Send test event** sends a `webhook.test`.

Each delivery is a `POST` with a JSON body and the [Standard Webhooks](https://www.standardwebhooks.com/) headers `webhook-id` (the event id, the same on every retry: use it to ignore duplicates), `webhook-timestamp` and `webhook-signature`:

```json
{
  "id": "evt_570736d750ed4c4596883d04c30e23d1",
  "type": "user.role_changed",
  "timestamp": "2026-10-08T15:52:24.067Z",
  "data": {
    "user": { "id": "iMRp...", "email": "bob@example.com", "emailVerified": true, "name": "Bob", "username": "bob", "image": null, "role": "admin", "banned": false },
    "previousRole": "user"
  }
}
```

Payloads carry ids, email, name, role and organization only: never passwords, tokens, two-factor secrets or ban reasons. Membership events carry `data.member` (`id`, `organizationId`, `userId`, `role`).

Verify the signature on the raw body before trusting it (any Standard Webhooks library works too, e.g. the `standardwebhooks` npm package):

```js
import { createHmac, timingSafeEqual } from "node:crypto";

// secret: "whsec_..." from the admin console. body: the raw request body (a string).
function verifyOstiaryWebhook(secret, headers, body) {
  const id = headers["webhook-id"];
  const timestamp = headers["webhook-timestamp"];
  const signatures = headers["webhook-signature"] ?? "";
  if (!id || !timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const expected = Buffer.from(`v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`);
  return signatures.split(" ").some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), expected));
}
```

Answer with any 2xx within 10 seconds. Redirects are not followed. A failed delivery is retried 4 times (after 5 minutes, 1 hour, 6 hours and 18 hours) and then marked failed; an endpoint that fails 15 times in a row is disabled, which the console shows. Each endpoint has a **Delivery log** (status, response code, attempts, next retry, the start of the answer) with **Redeliver**. Endpoint changes are in the audit log.

Delivery starts right after the request that caused the event, without slowing it down. Retries are sent by `GET /api/cron/webhooks` on the auth app, which needs `CRON_SECRET` (Vercel Cron sends it as `Authorization: Bearer $CRON_SECRET`). `apps/auth/vercel.json` runs it once a day because **Vercel Hobby only allows daily cron jobs**; on Pro, set the schedule to `*/5 * * * *`, or call the route from any other scheduler with the same header. Instances also retry due deliveries on their own, at most once a minute, whenever they send an event.

Endpoint URLs must use HTTPS and resolve to public addresses only: private, loopback, link-local and cloud metadata addresses are refused when saving and again before each delivery (the connection is pinned to the checked addresses). For local development, `WEBHOOKS_ALLOW_LOCALHOST=true` also accepts `http://localhost` (ignored in production).

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

## API keys for your APIs

People can create **API keys** for their scripts and tools, for one of the APIs registered in Ostiary (admin console, **APIs**). Off by default: turn them on in the admin console, **API keys**, and set the maximum lifetime (90 days by default, 365 at most).

**Creating a key** (account page, **API keys**): a name, one API, some of that API's scopes, and an expiry within the maximum. The key (`ost_` and 64 random letters) is shown once; Ostiary stores only its SHA-256 digest and its first characters. Creating a key needs a sign-in from the last 10 minutes, like adding a passkey, and an admin impersonating the user cannot create one. Up to 25 keys per account. Users list and revoke their keys on the same page; admins see every key (owner, API, scopes, created, last used, expires) and revoke any of them, also from the user's page. Creations and revocations are in the audit log.

**Organization keys.** An organization can own keys too, for its shared scripts and services: the organization owns the key, so it keeps working when the member who created it leaves the organization or deletes their account (the key records who created it). Owners and admins of the organization manage them in the account page, **Organizations**, **API keys** under the organization; members do not see them. Same rules as personal keys (one API and its scopes, expiry within the maximum, shown once, recent sign-in, no impersonation), up to 50 keys per organization, never for the default Public workspace. Deleting the organization deletes its keys. Admins see them on the organization's page in the admin console and on **API keys**, and revoke them. Creations and revocations are in the audit log with the organization as target. In the Better Auth plugin these are the `organization` configuration (`references: "organization"`, `referenceId` = organization id); owners and admins hold the `apiKey` permission in the organization's access control.

Which APIs accept keys: every enabled API that declares scopes and is open to every application. **Not** an API limited to linked applications: there an admin chose which apps may call it, and a key is not tied to an app, so keys would be a way around that choice. If an API is later disabled, deleted or limited to linked applications, its keys stop working; scopes removed from an API are removed from its keys' answers.

**Verifying a key (in your API).** Your API receives the key from the script (how is up to you, for example an `x-api-key` header) and asks Ostiary:

```bash
curl -X POST https://auth.example.com/api/auth/api-key/verify \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -H 'content-type: application/json' \
  -d '{"key": "ost_...", "resource": "https://api.example.com"}'

# {"valid": true, "keyId": "...", "ownerType": "user", "userId": "...", "api": "https://api.example.com",
#  "scopes": ["orders:read"], "expiresAt": "2026-11-07T15:49:36.523Z"}
# {"valid": true, "keyId": "...", "ownerType": "organization", "userId": null, "organizationId": "...",
#  "api": "https://api.example.com", "scopes": ["orders:read"], "expiresAt": "..."}
# {"valid": false, "error": "invalid_key"}
```

- **Who may call it.** Your API authenticates as a confidential application registered by an admin (Applications), with HTTP Basic as above (`client_secret_basic`, the default), or `client_secret_post` / `private_key_jwt` if the application is registered that way: the same client authentication as `/oauth2/introspect`. That application must be **linked** to the API (APIs, Access, "Linked applications"; links work whether or not the API is limited to them), which is also what lets it introspect the API's tokens. Public and self-registered applications are refused (`401 invalid_client`); an application not linked to `resource` gets `403 access_denied`.
- **Audience.** `resource` is your API's identifier. A key made for another API gets `invalid_key`, the same answer as an unknown key, and does not use up that key's rate limit.
- **Answers** (HTTP 200): `valid: true` with the owner (`ownerType` `"user"` and `userId`, or `"organization"`, `organizationId` and `userId: null`) and the scopes the key grants; or `valid: false` with `error`: `invalid_key` (unknown, revoked, for another API, its owner is banned, or its organization was deleted), `expired`, `rate_limited` (with `retryAfter` in seconds), `api_unavailable` (the API was disabled, deleted or limited to linked applications), `api_keys_disabled` (turned off in the admin console). Form-encoded bodies work too.
- **Rate limits.** 300 verifications per key per minute, and 600 per minute per calling address on the endpoint. Cache a successful answer for a short while (a minute or so) rather than verifying on every request; revocation then takes effect within that time.

**A key is never a session.** The Better Auth plugin can turn API keys into sessions (`enableSessionForAPIKeys`); Ostiary keeps that off. A key sent to Ostiary itself (`x-api-key`, `Authorization: Bearer`, anything) signs nobody in, on the auth app or the admin console. The plugin's own HTTP endpoints (`/api-key/create`, `/list`, `/get`, `/update`, `/delete`) are closed: keys are managed only from the account page and the admin console, which apply the rules above.

**Revocation.** Banning a user (admin console, or SCIM deactivation) deletes their personal keys; deleting the account deletes them too. Neither touches the keys of their organizations; deleting an organization deletes its keys. A ban written any other way is still checked at verification. Turning API keys off in the admin console refuses every key without deleting them. Expired keys are refused, then deleted.

Keys belong to users. The plugin also supports keys owned by an organization; Ostiary does not offer them yet (they need per-organization roles for managing keys).

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
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | both | optional | "Sign in with GitHub" from the environment (read-only in the admin console). Other providers are set up in the admin console, see [Social sign-in](#social-sign-in) |
| `SCIM_TOKEN_SECRET` | both | optional | 32+ characters to hash SCIM tokens with; derived from `BETTER_AUTH_SECRET` when unset. Changing either invalidates SCIM tokens |
| `RATE_LIMIT_ENABLED` | both | optional | Rate limiting of the auth endpoints, see [Rate limiting](#rate-limiting). Default: on in production, off in development. `false` turns it off |
| `IP_ADDRESS_HEADERS` | both | optional | Comma-separated headers holding the client IP, tried in order. Default `x-forwarded-for` (right on Vercel). See [Client IP](#client-ip) |
| `API_KEY_PREFIX` | both | optional | Prefix of new API keys (default `ost_`; letters, digits, `_`, `-`, 16 at most). Existing keys keep theirs |
| `TRUSTED_PROXIES` | both | optional | Comma-separated IPs or CIDR ranges of your own reverse proxies, to read the client IP from a multi-hop `x-forwarded-for` |
| `CAPTCHA_PROVIDER`, `CAPTCHA_SITE_KEY`, `CAPTCHA_SECRET_KEY` | auth | optional | Captcha on sign-up, password sign-in, password reset and sign-in codes. Provider: `cloudflare-turnstile`, `hcaptcha` or `google-recaptcha` (v2 checkbox). Set all three or none, before building (the CSP is built with them) |
| `CRON_SECRET` | auth | for webhooks | 16+ characters. Protects `/api/cron/webhooks`, which retries failed webhook deliveries (Vercel Cron sends it) |
| `WEBHOOKS_ALLOW_LOCALHOST` | both | optional | `true` accepts `http://localhost` webhook endpoints. Development only, ignored in production |

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
- Two-factor authentication (authenticator app or backup code) applies to password sign-ins and emailed sign-in codes. Passkeys are already two factors; social and SSO sign-ins rely on that provider's own checks. Backup codes and authenticator secrets are stored encrypted.
- Admins must turn on two-factor authentication (`REQUIRE_ADMIN_2FA`). An admin without it is sent to set it up and cannot use the console or the admin endpoints until then; their own account keeps working. An admin who loses their authenticator and backup codes can have another admin reset it from the user's page (audited).
- Sign-in codes open existing accounts only (an unknown address gets the same answer and no email), expire after 10 minutes, are stored hashed and are void after 3 wrong tries. On an account whose email was never verified, the first code verifies it and removes the unproven password and sessions.
- Only admins can create organizations and register SSO providers; SSO domains must be verified with a DNS record. SAML sign-ins are SP-initiated only, with signed responses, audience, recipient, `InResponseTo` and one-time assertion checks (see [Enterprise SSO with SAML 2.0](#enterprise-sso-with-saml-20)).
- SCIM tokens are stored as HMAC digests and can only be issued by platform admins; each one only reaches its own organization.
- API keys are stored as SHA-256 digests, always expire, never act as a session, and are verified only by applications linked to the key's API. Banning or deleting an account revokes its keys; deleting an organization deletes the organization's keys.
- Token signing keys can be rotated on a schedule or on demand (**Signing keys**); retired keys stay published only for the grace period. Rotations and setting changes are in the audit log.
- Social provider secrets (client secrets, Apple's private key) are encrypted at rest with AES-256-GCM, under a key derived from `BETTER_AUTH_SECRET`, and never sent back to the browser.
- The audit log never stores passwords, secrets or session tokens.
- App icons are fetched by Ostiary, never by the user's browser (so the app's site and favicon services don't learn who uses which app), with the webhook SSRF guard: https on port 443 only, public addresses only, pinned connections, two redirects at most, size and time limits, image types checked from the bytes. They are served with a CSP that blocks scripts.
- Sign-in, codes, password reset and the token endpoint are rate limited per client IP, see below.

### Rate limiting

Better Auth counts requests per client IP and endpoint. Ostiary keeps the counts in Postgres (table `rate_limit`, migration `0005_rate_limit`) instead of each server's memory: on Vercel every function instance has its own memory, so in-memory limits barely apply. It is on in production and off in development; set `RATE_LIMIT_ENABLED=true` to try it locally.

A refused request gets `429 Too Many Requests` with a `Retry-After` header (seconds) and `{"code": "RATE_LIMITED", "retryAfter": 42, "message": "..."}`. The sign-in, code, two-factor and device screens show "Try again in 42 seconds" in the user's language. A rule allows `max` requests, then refuses until `window` seconds have passed since the last allowed one.

| Endpoint | Limit per IP | Why |
| --- | --- | --- |
| `/sign-in/email`, `/sign-in/username` | 10 per minute | Password guessing; room for several people behind one address |
| `/sign-in/social` | 60 per minute | Only returns the provider's authorization URL; room for an office signing in at once |
| `/one-tap/callback` | 60 per minute | Google One Tap: checks a Google-signed ID token |
| `/sign-up/email` | 10 per 5 minutes | Each sends a verification email |
| `/request-password-reset`, `/send-verification-email` | 5 per 10 minutes | Each sends an email to any address |
| `/email-otp/send-verification-otp`, `/sign-in/email-otp` | 3 per minute | Sign-in codes (also void after 3 wrong tries) |
| `/two-factor/verify-totp`, `/verify-backup-code`, `/verify-otp` | 5 per minute | Second step; the account also locks after repeated wrong codes |
| `/device` (code lookup) | 5 per 10 minutes | Device user codes |
| `/device/approve`, `/device/deny` | 10 per minute | |
| `/oauth2/token` | 300 per minute | Machine clients, refreshes and device polling share server addresses; every credential it takes is long and random |
| `/api-key/verify` | 600 per minute | API servers verifying their users' keys; each key also has its own limit (300 a minute) |
| `/oauth2/register` | 5 per minute | Plus the hourly cap set in the admin console |
| `/oauth2/authorize`, `/oauth2/userinfo`, `/oauth2/introspect` | 30, 60, 100 per minute | Better Auth's OAuth provider defaults |
| `/get-session`, `/jwks` | none | Hot, read-only, nothing to guess |
| Anything else | 100 per 10 seconds | Better Auth's default |

The rules are in `packages/core/src/lib/rate-limit.ts`. Limits are per address, so an office or a classroom behind one IP shares them: raise a rule there if your users sign in from large shared networks.

**Table size.** One row per client IP and endpoint. When a counter's window ends, Better Auth deletes the rows not used for longer than the longest window (10 minutes), so the table holds roughly the addresses seen in the last 10 minutes; no cron job is needed. Each counted request costs two small queries (read, then a conditional update or insert).

**Redis (optional, not built in).** For heavy traffic, Better Auth can keep the counts in a key-value store instead: pass `secondaryStorage` (with an atomic `increment`, e.g. Upstash Redis) to `betterAuth()` and set `rateLimit.storage: "secondary-storage"` in `packages/core/src/lib/auth-factory.ts`. Note that `secondaryStorage` also moves sessions and verification values out of Postgres.

### Client IP

Rate limits, the IP stored with sessions, the audit log and the sign-in history all need the real client address, and all resolve it the same way (Better Auth's `getIPFromHeader`, with the settings below). By default Better Auth reads `x-forwarded-for` and trusts it only when it holds a single address.

- **Vercel**: nothing to set. Vercel overwrites `x-forwarded-for` with the client's address, so clients cannot spoof it.
- **Behind Cloudflare**: `IP_ADDRESS_HEADERS=cf-connecting-ip` (only if the origin accepts traffic from Cloudflare alone).
- **Behind nginx, a load balancer or several proxies** that append to `x-forwarded-for`: set `TRUSTED_PROXIES` to their addresses (e.g. `10.0.0.0/8`). The client IP is then the right-most address that is not a trusted proxy. Or have the proxy overwrite a header (`proxy_set_header X-Real-IP $remote_addr;`) and set `IP_ADDRESS_HEADERS=x-real-ip`.
- **Exposed directly, no proxy**: clients control every header. Put a proxy in front, or limits can be dodged by sending a different `x-forwarded-for` each time.

Never name a header your proxy passes through from the client: anyone could then pick their own IP. When no trusted address is found, all such requests share a single counter per endpoint, and Better Auth logs a warning. The audit log and sign-in history then record no IP rather than a guessed one. They keep IPv6 addresses whole, written in full (`2001:0db8:0000:…:0001`), where rate limits group them by /64.

Found a vulnerability? Please email the maintainer rather than opening a public issue.

## In production

[Cyber Auth](https://www.cyberauth.co), the single sign-on for the Cyber ecosystem (CyberCTF, Cyber Courses, Cyber Bench), runs on Ostiary.

## Credits

Built on [Better Auth](https://www.better-auth.com) (MIT). Ostiary is a community project and is not affiliated with Better Auth. Type: [Instrument Sans and Instrument Serif](https://github.com/Instrument) and [Geist Mono](https://vercel.com/font) (SIL Open Font License).

## License

[MIT](LICENSE) © Florian Amette
