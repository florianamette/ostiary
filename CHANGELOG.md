# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Upgrading

- Migration `0014` converts every timestamp column to `timestamptz`, reading existing values
  as UTC (how Ostiary wrote them; a database whose session time zone is not UTC shifts values
  that Postgres filled with `now()` by that offset). It rewrites each table once.
- The same migration stops, naming them, if two SSO providers claim the same email domain in
  any letter case: keep one, then deploy again ([Enterprise SSO](https://www.ostiary.dev/docs/enterprise-sso#upgrading-from-before-migration-0014),
  "Upgrading").
- Outside Vercel, production now requires `BETTER_AUTH_URL` (or `AUTH_APP_URL`). Admin API
  writes (`/api/admin/*`) need `ADMIN_APP_URL`, and must come from the console's origin.
- `zod` 4 (from 3.25) and Next.js 16.4.5 (from 16.4.0).

### Security

- `pnpm audit` is clean: shadcn CLI 4.23.0 (from 4.1.0) drops the vulnerable zod 3, undici,
  hono, body-parser and other packages it pulled in, and minimatch is pinned to 11.0.1+ under
  eslint-plugin-import. All of them were development dependencies.
- Next.js 16.4.5 (from 16.4.0): fixes GHSA-2464-fhr4-w9xw and GHSA-673q-mjm6-r5xr (critical)
  and GHSA-p3m5-59mp-jv5r. `zod` 4.6.7 (GHSA-mrhx-c7xc-m3w5); `vite` and `vitest` patched;
  `shadcn` (build-time CSS only) moved to dev dependencies.
- The admin API (`/api/admin/*`) refuses writes whose `Origin` is not the admin console and
  bodies that are not `application/json`, so a page on a sibling subdomain (`COOKIE_DOMAIN`)
  cannot act with an admin's cookies. Every response is `Cache-Control: no-store`, including
  the one carrying a new client's secret.
- Admin API writes are rate-limited per admin and client IP in Postgres (the IP Better Auth
  trusts, not a raw `x-forwarded-for`), so the limit holds across instances.
- Webhook signing secrets use the shared encryption helper (fixed 16-byte authentication
  tag); secrets stored in the old format still decrypt, with the tag length checked.
- SCIM links an existing account only when its domain exactly matches a verified provider
  domain (one plain hostname; lists and URL forms are refused).
- Suspending an account through SCIM revokes it like a ban: OAuth tokens and the user's API
  keys, with audit entries.
- One SSO provider per email domain, in any letter case: registration (`SSO_DOMAIN_TAKEN`),
  console edits and a unique index all refuse a second one.
- The device sign-in page loads the app's icon through Ostiary (`/api/app-icon`), like the consent
  screen, instead of from the app's `logo_uri`: the app's site no longer learns who is approving.
- drizzle-kit's migration loader (`@esbuild-kit/core-utils`) now runs esbuild 0.25.12 instead of
  0.18.20 (GHSA-67mh-4wv8-2f99, development server only; dev dependency).

### Documentation

- The guides live on [ostiary.dev/docs](https://www.ostiary.dev/docs) only: the `docs/` folder
  is gone, and the README, `.env.example` files and code comments link to the site.
- The README is an overview again (776 → 189 lines): the guides moved to `docs/` (connect an app,
  social sign-in, enterprise SSO, SCIM, webhooks, MCP and agents, API keys, your data,
  configuration, security, testing). Both `.env.example` files say where each value comes from;
  the admin one was ignored by git and is now in the repository.

### Added

- **Sign-out from the app (RP-initiated logout).** **Register application** and **Edit
  application** have a **Sign-out from the app (RP-initiated logout)** option and optional
  **Post-logout redirect URIs**: the app may then send the user to the advertised
  end-session endpoint (`/api/auth/oauth2/end-session`) to end the Ostiary session, and its ID
  tokens carry `sid`. Before, admin-registered apps could never use it (#63). Ticked by default
  for apps registered in the console; existing apps, and clients created with the JSON API
  without `enable_end_session`, keep it off. `POST` and `PATCH /api/admin/oauth-clients` take
  `enable_end_session` and `post_logout_redirect_uris` (an empty list clears them; URIs without
  `enable_end_session` are refused). Changes are audited in `oauth_client.update`'s fields. See
  `docs/connect-an-app.md`.
- **Health endpoint.** `GET /api/health` on both apps answers 200 `{"status":"ok"}` when the
  database responds within 3 seconds and 503 otherwise, for load balancers and uptime
  monitors. The Docker images' `HEALTHCHECK` uses it (it used `/api/auth/ok` and `/icon`).

- **Machine-to-machine applications from the console.** **Register application** has a
  **Machine-to-machine (client credentials)** client type: a confidential client with the
  `client_credentials` grant only, no redirect URIs, consent or device sign-in, limited to the
  API scopes ticked in the dialog and linked to their APIs. The applications list shows the
  type (and filters on it), and **Edit application** only offers the name and icon for such a
  client. `POST /api/admin/oauth-clients` no longer requires `redirect_uris` without the
  `authorization_code` grant, takes `resources` (APIs to link the client to), and refuses a
  public `client_credentials` client; `PATCH` refuses device sign-in on a machine client. See
  `docs/protect-an-api.md`.
- **CSV export of users and the audit log.** An **Export CSV** button on the Users and Audit
  pages downloads what the page shows, with its search and filters, every page of it
  (`GET /api/admin/users/export`, `GET /api/admin/audit/export`; platform admins only, from the
  console itself). UTF-8 with a BOM so Excel opens it right, RFC 4180 quoting, timestamps in
  ISO 8601 UTC, and a leading `'` on cells that a spreadsheet would run as a formula. Users
  carry their profile, role, ban and two-factor status and last sign-in (while sign-in events
  are kept), never a password hash, secret or token; audit entries carry their metadata as
  JSON. Rows are streamed 1,000 at a time and capped at 100,000, past which the file ends with
  a `# truncated` line. Audited as `user.export_csv` and `audit_log.export_csv`, with the
  filters and the row count.
- **Custom claims per application.** **Applications > Token claims** adds claims to an app's
  ID token, access token and UserInfo, the declarative equivalent of an Auth0 Action that sets
  claims: each one is fixed text or JSON, or a user attribute from a fixed list (platform role,
  email verified, username, two-factor, the active organization's id, slug and role, the
  user's organizations). No scripts. Reserved claims (`iss`, `sub`, `aud`, `email`, `role`…)
  are refused, at most 20 claims and 4 KB per app, with a preview for an example user. They
  follow refresh token rotation; client credentials tokens get the fixed values only. Stored
  in `oauth_client_claims` (migration `0015`), audited as `oauth_client.claims_update`. See
  `docs/connect-an-app.md`.
- **Import users.** **Users > Import users** in the admin console brings accounts over from an
  Auth0 user export (with the password hash export Auth0 support provides) or a CSV file. A
  dry run first counts the users to create, the addresses that already have an account or
  reach the same inbox (`EMAIL_DEDUP`) and the invalid rows, with their reasons; the import
  then writes what it showed, 500 users per transaction, each in the Public organization.
  Existing accounts are never changed, no email is sent, and no one becomes an admin unless
  the CSV says so and the admin allowed it (`ADMIN_EMAILS` does not promote at import).
  Imported bcrypt hashes (`$2a$`, `$2b$`, `$2y$`) keep working and are replaced by scrypt at
  the next successful sign-in; other hash formats are refused per row. Social identities,
  MFA enrolments and passkeys are not imported. Audited as `user.import`. See
  `docs/import-users.md`.
- **One client per MCP app.** Claude and other MCP clients register again on every connection,
  which filled the Applications page with identical "Claude" clients. An anonymous registration
  identical to an existing public client (same name, redirect URIs, grants, response types,
  scopes, software id and version, website, terms, privacy policy and contacts) now gets that
  client back: same `client_id`, `201` with its stored metadata. Never for confidential
  clients, clients registered with a session, disabled clients or registrations that differ,
  so the first to register a name cannot put their own links on everyone else's consent
  screen. On by default; *Reuse identical public clients* in **Applications >
  Self-registration** turns it off. `/oauth2/register` keeps its limit of 5 a minute per IP,
  now in Ostiary's own rate-limit table.
- **Remove unused duplicates.** The Applications page collapses identical self-registered
  clients into one row (*Claude ×12*). Its **Remove unused duplicates** button keeps the most
  recently used client of each group and deletes the others unless they still hold a live
  access or refresh token (those are kept and counted, so no one is signed out); disabled
  clients are left alone. It can also delete self-registered clients never used after a number
  of days. Audited as `oauth_client.remove_duplicates`.
- **One account per inbox (`EMAIL_DEDUP`).** Off by default. `gmail` refuses a sign-up or
  email change to an alias of an existing account's Gmail address (dots, `+tag`,
  `googlemail.com`); `plus` also ignores `+tag` on every domain. Answered like a taken
  address, so it reveals nothing.
- **Docker.** A `Dockerfile` (auth, admin and migrate targets; standalone Next.js servers
  running as an unprivileged user, with health checks) and a `docker-compose.yml` with
  Postgres 17, a migration job, both apps and a daily housekeeping job.
  `docs/self-hosting.md` covers the reverse proxy, the client IP header, backups and
  upgrades. `NEXT_OUTPUT=standalone` builds a standalone server for either app.
- `AUTH_EVENT_RETENTION_DAYS` (default 90): sign-in events are purged by the daily cron
  route, and failed sign-ins lose the typed identifier and IP address after 30 days.
- Admin console: search and pagination on the Organizations page; an organization's members
  are paginated with the real count (the list stopped at 500, or 50 for Public). The audit
  log pages back past the latest 200 entries and searches by who acted. Search, filters and
  page are kept in the URL on every list, so the back button keeps them.
- CI fails when the schema and the committed migrations differ. Dependabot (npm and GitHub
  Actions, weekly) and CodeQL. A smoke test loads every admin console page; the e2e package
  is linted; the apps' `lib/` files have unit tests.
- **Icon URL for applications.** Admins set an app's icon (`logo_uri`) when registering it
  or in **Edit** (`logo_uri` in `POST` and `PATCH /api/admin/oauth-clients`; empty or null
  clears it), and for dynamically registered clients with **Set icon**. Useful for CLIs,
  desktop apps and local development, which only redirect to localhost and so had no site to
  take an icon from. The URL must be https on a public host and the default port, the same
  rule the icon lookup applies. The console's icon URL changes with it, so a new icon shows
  at once.
- **Vercel Web Analytics, opt-in.** `VERCEL_ANALYTICS=true` adds it to both apps. Page views
  are sent without query strings or fragments, so tokens in sign-in URLs never leave the browser.
- **Your data: export and account deletion** (GDPR access, portability and erasure). A new
  **Your data** section on the dashboard. **Download my data** returns one JSON file with the
  profile, sign-in methods, passkeys, two-factor status, sessions, connected apps with consents
  and token history, API keys, organizations, invitations, SSO and SCIM records, audit log
  entries and sign-in events, and never a secret (no password hash, token, provider token,
  two-factor secret, backup code, passkey key or API key); it needs a recent sign-in, is
  limited to 3 an hour and is audited. Admins get **Export data** on the user's page.
  **Delete my account** asks for the email address and the password (or a recent sign-in),
  then emails a link (in the user's language) to a confirmation page; Better Auth's GET
  callback is closed. Refused for admins (another admin demotes them first), the only owner of
  an organization, accounts provisioned by SCIM, and during impersonation. Every deletion,
  self-service or by an admin, also erases what foreign keys leave: audit log entries are kept
  with the person's email, name and IPs replaced, sign-in events lose IP and identifier,
  pending codes, invitations to the address and impersonation sessions are deleted, sent
  webhook payloads are redacted, and console-registered apps and SSO providers are detached
  instead of being deleted with their admin. `organization.member.removed` webhooks are sent
  for the memberships that go with the account. Mapping of every table in the README. No
  migration.

- **Sign-in branding per application.** When people arrive from an app, the login, sign-up,
  two-factor, email-code, password reset, consent, select-account and device screens say
  "Sign in to continue to <app>" with its logo, tagline and accent color, and the side panel
  can show its own headline and image. Set from the admin console (**Applications**, **Sign-in
  branding**) with a live light/dark preview and WCAG contrast checks (button labels always
  reach AA; text in the accent is adjusted per color scheme; a warning below 3:1 against the
  card); optionally only some social providers (and One Tap with Google) on that app's
  screens. Logos come from the app icon, an https URL fetched and cached by the server (SSRF
  guard) or an upload; images are served from `/api/app-branding/<client_id>/<logo|panel>`
  with a sandbox CSP. The app is only taken from Better Auth's signed authorization request
  (signature and a signed `client_id` checked) or from a short-lived HMAC app context token
  that carries it through sign-up, password reset and their email links; verifying a new
  account or resetting a password now resumes the app's authorization instead of ending on
  the dashboard. Self-registered clients never get custom branding: their name with an
  "Unverified app" warning. Ostiary's mark stays on every screen. Stored in the new
  `oauth_client_branding` table (migration `0012_app_branding`); changes are audited. Forks
  can restyle what the accent reaches through `[data-app-brand="accent"]` in `globals.css`.
- **End-to-end tests** (`e2e/`, Playwright 1.63 with Chromium) and an `e2e` CI job: both apps
  built and started with `next start` against Postgres 17, plus a local mock server (a
  GitLab-compatible OAuth provider and a webhook receiver). Covers APIs and scopes created in
  the admin console, per-client API access, social providers turned on at runtime with a full
  social sign-in, signing key rotation, sign-up with email verification, password and code
  sign-ins, TOTP, the admin two-factor gate, rate limits, authorization code with PKCE and
  consent, refresh, UserInfo, device flow, webhooks, API keys, Dynamic Client Registration
  and per-app branding of the login page.
  Test seam `E2E_TEST_MODE` (emails to a file, localhost webhooks, no Have I Been Pwned call),
  honoured only on a loopback `http://` auth URL. See README, Testing.
- **Organization API keys.** Owners and admins of an organization create, list and revoke
  keys the organization owns, from the account dashboard (**Organizations**, **API keys**
  under the organization); members do not see them. The key belongs to the organization, so
  it keeps working when the member who created it leaves; `apikey.created_by` records them.
  Same rules as personal keys (one API and its scopes, expiry within the admin maximum, shown
  once, recent sign-in, no impersonation, no linked-only APIs), at most 50 per organization,
  never for the Public workspace. Built on the plugin's own model: a second configuration
  (`configId: "organization"`, `references: "organization"`, `referenceId` = organization
  id), with the plugin's `apiKey` permission granted to the `owner` and `admin` roles (the
  other organization permissions are Better Auth's defaults, unchanged). `POST
  /api/auth/api-key/verify` now answers `ownerType` (`"user"` or `"organization"`), and
  `organizationId` with `userId: null` for an organization's key; user keys keep `userId`.
  Admin console: an **API keys** card on the organization's page, and organization keys on
  the **API keys** page, both with revoke. Audit entries (`api_key.create`,
  `api_key.revoke`) target the organization. Migration `0011_org_api_keys`: `reference_id`
  loses its foreign key to `user`; generated `user_id` and `organization_id` columns carry
  cascading foreign keys instead, so deleting an account still deletes its personal keys
  and deleting an organization deletes its keys; `created_by` (set null when that account
  is deleted). Strings in all 20 languages.
- **Google One Tap** on the sign-in and sign-up pages, with Better Auth's `oneTap` plugin.
  Turned on per provider in the admin console (**Sign-in providers** > Google > **Show
  Google One Tap**, new `social_provider.one_tap` column, migration `0010_google_one_tap`),
  only while Google is on. It uses Google's runtime settings from the console: before each
  request, the providers' options are mirrored into Better Auth's `socialProviders`, which
  is where the plugin reads the client ID, `hd` and the sign-up setting, so a change
  applies within 30 seconds without a restart. `POST /api/auth/one-tap/callback` answers
  404 while One Tap is off and is limited to 60 a minute per address. A One Tap sign-in
  counts as Google for "last used", resumes a pending app authorization like other
  sign-ins, and never auto-selects an account. Not shown to someone signed in, when
  adding an account, or when the device last used another method; dismissed or
  unsupported (no FedCM), nothing appears. The Content Security Policy allows
  `accounts.google.com/gsi/` on the sign-in and sign-up pages only. Needs the auth app's
  origin in the Google client's Authorized JavaScript origins.
- Sign-in page: a social sign-in refused because the provider may not create accounts now
  says so (`signup_disabled`), in all 20 languages.
- **SAML 2.0 enterprise SSO**, next to OIDC, with Better Auth's `@better-auth/sso` plugin.
  Admin console **SSO** page: an OIDC / SAML 2.0 switch; the IdP from a metadata URL
  (fetched server-side with the webhook SSRF guard), pasted metadata XML or by hand (entity
  ID, SSO URL, certificate); attribute mapping with presets for Okta, Entra ID, Google
  Workspace and JumpCloud; **Require signed assertions** (on by default). The ACS URL, SP
  entity ID and SP metadata URL are shown with copy buttons, with Okta and Entra ID setup
  notes; providers show their certificate expiry and can be edited (new metadata after a
  rotation, mapping, options, domain, organization), audited as `sso_provider.update`.
  Same DNS domain verification as OIDC. Sign-in stays "Sign in with SSO" by email domain;
  only SP-initiated sign-in is accepted (`InResponseTo` bound to a request from the last 5
  minutes, used once; each assertion ID once). Assertions need `NotBefore`/`NotOnOrAfter`
  (1 minute of clock skew). A guard in front of the ACS refuses responses with a DOCTYPE or
  entity declarations and XML signatures using SHA-1 or unknown algorithms (the plugin only
  checks the Redirect binding's `SigAlg`). IdP metadata with a DOCTYPE, several entities, no
  HTTP-Redirect endpoint, no valid signing certificate or `WantAuthnRequestsSigned` is
  refused. Failed SSO sign-ins return to the SSO page with an error. No migration.
- **App icons.** Each OAuth application gets a real icon on the account dashboard, the
  consent screen and the admin console: its `logo_uri`, else the icon its site links to
  (`<link rel="icon">`, `apple-touch-icon`, largest `sizes` or SVG first, then
  `/favicon.ico`); the site is `client_uri`, else the first public https redirect URI.
  Ostiary fetches the icon itself and serves it from `/api/app-icon/<client_id>` (signed-in
  users, for apps they are connected to or registered by an admin) and
  `/api/admin/app-icon/<client_id>` (admins), so neither the app nor a favicon service
  learns who uses which app. Fetching reuses the webhook SSRF guard (https on port 443,
  every resolved address public, pinned connection, at most two redirects each re-checked,
  3 s per request, 512 KB of HTML, 256 KB per icon) and the image type is sniffed from the
  bytes; SVG is served with `Content-Security-Policy: default-src 'none'` and `nosniff`.
  Icons are cached in the new `app_icon` table (migration `0009_app_icons`), refreshed
  after 7 days, failures retried after a day. Without an icon, a colored monogram. A
  self-registered app keeps the monogram on the consent screen (its icon could imitate a
  trusted app), and the consent screen no longer loads `logo_uri` from the browser.
- Admin console: an **App usage** page (tokens issued, users and consents per application
  over 30 days, with tiles), moved out of **Applications**, which keeps a link when some
  apps went unused. Each row links to the application (`/applications?q=<client_id>`).

- **API keys** for the APIs registered in Ostiary, with Better Auth's `@better-auth/api-key`
  plugin. Users create keys from the account page: a name, one API, some of its scopes and an
  expiry (needs a sign-in from the last 10 minutes); the key is shown once and stored as a
  digest. APIs verify keys at `POST /api/auth/api-key/verify`, authenticated as a confidential
  application linked to the API; a key for another API is refused, as are expired, revoked and
  banned users' keys. Keys are never sessions (`enableSessionForAPIKeys` stays off) and the
  plugin's own HTTP endpoints are closed. Admin console: a new **API keys** page (turn keys on,
  off by default; maximum lifetime; every key with revoke), keys on the user's page, and
  creations and revocations in the audit log. Banning or deleting an account (or a SCIM
  deactivation) revokes its keys. Rate limits: 300 verifications per key per minute, 600 per
  minute per address on the endpoint. Optional `API_KEY_PREFIX`. Needs the `apikey` table
  (migration `0007_api_keys`).
- Rate limits that work on serverless: Better Auth's counters are kept in Postgres
  (new `rate_limit` table, migration `0005_rate_limit`) instead of each instance's
  memory, so a limit holds across every Vercel function instance and both apps. On in
  production, off in development (`RATE_LIMIT_ENABLED`). Stricter limits per client IP
  on password sign-in (10 a minute), sign-up, password reset and verification emails,
  and two-factor codes (5 a minute); a higher one on `/oauth2/token` (300 a minute)
  for machine clients and refreshes; none on `/get-session` and `/jwks`. A refused
  request gets a standard `Retry-After` header, and the sign-in, code, two-factor and
  device screens say how long to wait, in all 20 languages. See README, Rate limiting.
- `IP_ADDRESS_HEADERS` and `TRUSTED_PROXIES` to read the client IP behind proxies other
  than Vercel's (Cloudflare, nginx, load balancers). The default, a single-address
  `x-forwarded-for`, is right on Vercel.
- Admin console: a **Signing keys** page for the keys that sign ID tokens and JWT
  access tokens. It lists every key (key ID, algorithm, created, signs until, published
  until, and whether it is current, still published for verification, or expired; private
  keys are never shown), has a **Rotate now** button, and sets automatic rotation (off,
  or every 30, 90, 180 or 365 days) and the grace period a retired key stays in the JWKS
  (1, 7, 30 or 90 days). Settings are stored in `app_setting` and applied to Better
  Auth's jwt plugin before each request, so they reach the auth server within a minute.
  Rotation stays off and the grace period stays 30 days until an admin changes them, so
  upgrading changes nothing. Turning rotation on also dates the current key (it retires
  when it reaches the interval, or at the next token if it is already older). Rotations
  and setting changes are in the audit log, with a new **Signing keys** filter. The
  discovery document and the JWKS URL are unchanged. No migration.
- **Webhooks**: apps are told when users change. Admin console **Webhooks** page to
  add, edit, disable and delete endpoints, choose events, regenerate the signing
  secret (shown once, stored encrypted; the old one keeps signing for 24 hours),
  send a test event, and read each endpoint's delivery log with **Redeliver**.
  Events: `user.created`, `user.updated`, `user.deleted`, `user.banned`,
  `user.unbanned` (including SCIM deactivation), `user.role_changed`,
  `organization.member.added`, `organization.member.removed` and
  `organization.member.role_changed`, recorded once the change is committed, with
  a minimal payload. Deliveries are signed per Standard Webhooks, sent right after
  the request, and retried with backoff (5 attempts over about a day) by the new
  `/api/cron/webhooks` route (`CRON_SECRET`; daily in `vercel.json`, as Vercel Hobby
  allows); an endpoint failing 15 times in a row is disabled. URLs must be HTTPS on
  public addresses (`WEBHOOKS_ALLOW_LOCALHOST=true` for local development). Admin
  actions are in the audit log. Migration `0006_webhooks` adds `webhook_endpoint`
  and `webhook_delivery`.
- Social sign-in with every provider Better Auth supports (36: Apple, Atlassian,
  Cloudflare, Amazon Cognito, Discord, Dropbox, Facebook, Figma, GitHub, GitLab,
  Google, Hugging Face, Kakao, Kick, LINE, Linear, LinkedIn, Microsoft, Naver,
  Notion, Paybin, PayPal, Polar, Railway, Reddit, Roblox, Salesforce, Slack,
  Spotify, TikTok, Twitch, X, Vercel, VK, WeChat, Zoom). Admin console: a new
  **Sign-in providers** page lists them with their logos; each one shows the
  callback URL to register, links to the provider's console and the setup guide,
  and takes its credentials, including provider-specific fields (Apple's team ID,
  key ID and private key, from which the client secret JWT is generated; the
  Microsoft tenant; Cognito's domain, region and user pool; GitLab's URL...).
  Providers can be turned on and off, ordered, renamed on their button, and limited
  to existing accounts. Secrets are encrypted at rest (AES-256-GCM, key derived from
  `BETTER_AUTH_SECRET`) and never sent back to the browser. Changes reach the auth
  server within 30 seconds, without a restart, and are in the audit log (with a
  **Sign-in providers** filter). `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` keep
  working and show as set by the environment. Needs the new `social_provider` table
  (migration `0008_social_provider`).
- Sign-in and sign-up pages: brand buttons in each provider's colours (legible in
  dark mode), "Sign in with Apple" / "Continue with Google" wording, and a layout
  that stays compact with many providers (a grid of names, then of logos with
  tooltips), keeping the last-used provider highlighted. Account dashboard:
  **Connected accounts** lists every enabled provider with its logo, still shows
  accounts of providers turned off since, and cannot remove the last way to sign
  in. The admin user page shows each linked provider's logo.
- Admin console: an **APIs** page to register the APIs (OAuth protected resources)
  that accept access tokens, with the scopes clients may request for each. Scopes
  are read from the database and reach the auth server within a minute, without a
  redeploy. An API can be restricted to its own scopes, or disabled.
  `OAUTH_API_SCOPES` and `OAUTH_API_AUDIENCES` keep working.
- Admin console, **APIs**: choose which applications can use each API. An API is
  open to every application (the default, unchanged for existing APIs) or only to
  the applications linked to it; other clients get `invalid_target`, including when
  they refresh a token. The Applications page lists each application's linked APIs.
  Better Auth's `enforcePerClientResources` is now on, with APIs open to every
  application counted as linked to every client.
- Admin console, **APIs**: token settings per API: access and refresh token
  lifetimes (shorter than the defaults only), custom claims added to its access
  tokens (reserved claims such as `sub`, `aud` or `role` are refused), and
  DPoP-bound tokens. Changes apply to the next token and are in the audit log.
- Device sign-in (OAuth 2.0 Device Authorization Grant, RFC 8628) for CLIs, TVs and
  other apps without a browser. The app gets a code from `/api/auth/device/code`, the
  user enters it on the new `/device` page (or opens the link with the code filled
  in), sees the app and the scopes, and approves or denies; the app then collects its
  tokens from `/oauth2/token`. Discovery lists `device_authorization_endpoint` and the
  `urn:ietf:params:oauth:grant-type:device_code` grant. Codes expire after 10 minutes.
  Admin console: **Device sign-in** when registering or editing an application, a
  badge and a filter in the list. Approvals and denials are in the audit log. Needs
  the new `device_code` table (migration `0001_device_code`).
- Two-factor authentication with an authenticator app (TOTP) and single-use backup
  codes. Users turn it on from the account dashboard (password, QR code, a code to
  confirm, then the backup codes, shown once), and can create new backup codes or
  turn it off. Password sign-ins then ask for a code or a backup code, with a "trust
  this device for 30 days" option; sign-ins started by an app (OAuth) continue to the
  app after the code. Migration `0002_two_factor` adds the `two_factor` table and
  `user.two_factor_enabled`.
- Admins must use two-factor authentication: an admin without it is sent to set it
  up, and the admin console and admin endpoints refuse them until then. Controlled by
  `REQUIRE_ADMIN_2FA` (default `true`; `false` turns it off).
- Admin console: the user page shows whether two-factor authentication is on, and an
  admin can reset it for a user who lost their authenticator (recorded in the audit
  log).
- SCIM 2.0 provisioning per organization (`@better-auth/scim`), at `/api/auth/scim/v2`.
  Platform admins generate, replace and revoke the bearer token from the organization page
  of the admin console (audited). Provisioned people join the organization; deactivating or
  deleting them in the identity provider bans the account, signs it out and revokes its OAuth
  tokens, without deleting it. Setup steps for Okta and Entra ID are in the README. New
  tables `scim_*` (migration), optional `SCIM_TOKEN_SECRET`.
- Several accounts in one browser (up to 5). The account menu lists them, switches between
  them, adds one and signs out of one or all. The select-account page (`prompt=select_account`)
  lists every signed-in account and continues the app's request with the one picked.
- Sign-in: **Email me a sign-in code**. The login screen sends a 6-digit code to the
  account's address; typing it on the same page signs in, so it works when the email is
  read on another device and an OAuth sign-in carries on to the app. Codes open existing
  accounts only (unknown addresses get the same answer and no email), expire after 10
  minutes, are stored hashed and are void after 3 wrong tries. A code proves the inbox:
  on an unverified account it verifies the address and removes the unproven password
  and sessions. Banned users stay out, and accounts with two-factor authentication still
  get the second step. The email is written in the language of the page it was asked
  from, in all 20 locales.
- Optional captcha on sign-up, password sign-in (email or username), password reset
  requests and sign-in code requests: Cloudflare Turnstile, hCaptcha or reCAPTCHA v2,
  with Better Auth's `captcha` plugin. Off unless `CAPTCHA_PROVIDER`, `CAPTCHA_SITE_KEY`
  and `CAPTCHA_SECRET_KEY` are set; the CSP then allows that provider only. The widget
  follows the light or dark theme.
- Self-registration of OAuth clients for MCP clients and AI agents: Dynamic Client
  Registration (RFC 7591, `POST /api/auth/oauth2/register`) and Client ID Metadata
  Documents (an HTTPS URL as `client_id`). Both are off by default and turned on in
  the admin console (**Applications > Self-registration**): who may register (signed-in
  users or anyone), the scopes self-registered clients may request, allowed metadata
  document hosts and an hourly cap. Settings are stored in the database (new
  `app_setting` table, migration `0004_app_setting`) and reach the auth server within
  a minute. Self-registered clients get authorization code with PKCE only (no client
  credentials, no device sign-in, never skip consent), are marked as unverified on the
  consent screen, and are listed with a badge and a filter on the Applications page,
  where an admin can disable or delete them. Discovery advertises
  `registration_endpoint` and `client_id_metadata_document_supported` while on. The
  README explains how an MCP server points clients to Ostiary (RFC 9728).

### Changed

- Database: new indexes for the queries the console, account export, erasure, rate caps and
  retention purges run; `sso_provider.organization_id` is a foreign key (`ON DELETE SET
  NULL`); a webhook event is queued at most once per endpoint (migration
  `0014_indexes_constraints_timestamptz`, which clears orphaned ids and duplicate
  deliveries first).
- The dashboard renders complete on first load: the session, connected apps, API keys and the
  deletion status are read on the server. The consent and device screens load the app and
  the user on the server. The overview's counts come from one query and stream in.
- One rule (`adminAccess`) decides admin access for the console proxy, layout, pages,
  actions and API routes, and one helper decides what counts as a recent sign-in.
- Shared setup in `packages/core`: `createAppAuth`, `withCsp`, locale path helpers and
  `createNextConfig`, used by both apps, with shared ESLint, TypeScript, PostCSS and Vitest
  bases (`packages/core/config/`).
- Sign-in and dashboard errors are shown in the user's language: Better Auth's English
  messages are no longer displayed, and database errors no longer reach the console.
- The authenticator QR encoder loads only when setting up two-factor authentication, and the
  auth app no longer depends on recharts. `@types/node` 22, matching CI.
- Account dashboard, **Connected applications**: each app shows its icon and its site's
  host instead of the client ID, permissions in plain words (API scopes such as
  `labs:publish` as they are; `openid` is implied), "Connected on" and "Last used", and
  links to its site. **Revoke access** is now a lighter **Disconnect** button (same
  confirmation). Strings in all 20 locales.

### Fixed

- `EMAIL_DEDUP` is listed in both apps' `.env.example` (the admin console's user import
  reads it), and the unused `SENTRY_DSN` and `LOG_REQUESTS` variables are gone (#65).
- The **Deploy with Vercel** button asks for `CRON_SECRET`. Without it the daily cron
  (`/api/cron/webhooks`) got `401`, so webhook retries and retention never ran on a fresh
  deploy. Existing projects without it: add it and redeploy (docs/deploy-vercel.md).
- The webhooks console no longer says that a disabled endpoint's pending events are sent again,
  or wait, when it is turned back on (the endpoint notice, the **Enabled** hint and the delivery
  log, in every language). Disabling an endpoint gives them up; the hints now say so and point
  to **Redeliver** (#62).
- **No more 500s while the database wakes up.** A new database connection that fails for a
  transient reason (serverless Postgres such as Neon starting, a refused or dropped
  connection, a server restarting) is retried up to 3 times within 12 seconds. Only the
  connection is retried, never a query. Bad credentials and a full pool fail at once, as before.
- `sslmode=require` (and `prefer`, `verify-ca`) in `DATABASE_URL` is applied as `verify-full`,
  which is what pg already did: same certificate and host name checks, without the SECURITY
  WARNING it printed on every start. URLs with `uselibpqcompat=true` are left as they are.

- Changing the language on a sign-in page keeps its query string, so an app's sign-in, a
  password-reset link or a device code survives the switch. A failed social sign-in returns
  to the login page with the app's sign-in intact, and a new account created during an app's
  sign-in returns to the app.
- The admin Consent page lists every user's consents (it showed only the signed-in admin's),
  with search and pagination; revoking one also revokes that app's tokens for the person, and
  is audited.
- The admin console can no longer remove or demote an organization's last owner.
- Membership webhook events from the console are queued in the same transaction as the
  change. Disabling a webhook endpoint gives up its pending deliveries, so re-enabling it
  never sends stale events (which could hold erased users' data); pending deliveries older
  than 30 days are purged. Redeliver resends in the same delivery row. Bulk user and member
  updates now emit events.
- Deleting an account erases its history only after the delete succeeds.
- Emails are sent after the response with errors logged, so they are no longer dropped on
  serverless platforms.
- Discovery documents are readable from other origins in production (browser-based OIDC
  clients).
- Role filters and the Administrators count include users with several roles
  (`user,admin`). Sign-in charts count days in UTC; failed sign-ins for one address in
  another letter case count as one account.
- Admin server actions check their arguments at runtime (a malformed request gets an error,
  not a 500); admin actions report network failures; removal and confirmation dialogs stay
  open with a spinner until the change is done; forms stay disabled while the browser leaves
  after a successful sign-in, consent or invitation.
- An admin email change unverifies the account only when the address actually changes.
  Concurrent signing-key rotations always leave the newest key live. Console setting changes
  are no longer lost when they land during a cache reload.
- Disconnecting an app from the dashboard is audited and refused while impersonating.
- Accessibility: password managers can generate passwords on sign-up; password-mismatch and
  consent errors are announced; focus returns to the code field after a wrong code.
- Network failures no longer leave a screen loading or disabled for good (account picker,
  two-factor settings, email code step, device approval).
- Empty values in a copied `.env` file (`GITHUB_CLIENT_ID=`, `AUTH_APP_URL=`...) count as
  unset instead of failing validation.
- **English left in translated screens.** The admin console rendered most of its text in
  English whatever the language: APIs, API keys, webhooks, applications (sign-in branding,
  self-registration, client dialogs), consent, users, organizations and SCIM, SSO and SAML,
  sign-in providers, usage, security, audit log labels and the overview. About 1,100 strings
  now go through the messages, including toasts, placeholders, aria-labels, confirmations,
  table headers, empty states and the errors server actions return (core validators keep
  their English `error` and add a `code` the console translates). Dates follow the page's
  language instead of the browser's. In the other 19 locales, about 420 values per locale
  that were still the English text (account dashboard, sign-in, SSO, consent, invitations)
  are translated, as are all the new keys. Protocol, product and provider names, scopes,
  header and environment variable names stay as they are. The translations are
  machine-written and would benefit from a review by native speakers. A unit test
  (`packages/core/src/i18n/messages.test.ts`) fails when a locale misses a key of `en.json`,
  has an extra one, or uses different ICU arguments or tags; `I18N_REPORT=1` lists values
  still identical to English.
- **Client IP in the audit log and sign-in history behind proxies.** These took the
  left-most `x-forwarded-for` value (whatever the client sent) and fell back to
  `x-real-ip`, unlike rate limits and sessions. They now resolve the address the way
  Better Auth does, with Better Auth's own function and the same `IP_ADDRESS_HEADERS` and
  `TRUSTED_PROXIES`: a single-address `x-forwarded-for` by default (Vercel), or the
  right-most address that is not a trusted proxy. A multi-address header without
  `TRUSTED_PROXIES`, or `x-real-ip` not listed in `IP_ADDRESS_HEADERS`, now records no IP
  instead of a spoofable one. IPv6 addresses are stored whole, in full form.
- Admin console: registering or editing an OAuth application showed "Request failed"
  instead of the reason. Better Auth 1.7 puts it in `error_description`, which is now
  shown (for example, a confidential client with an `http://localhost` redirect URI).
- Admin console: the redirect URI hint now says that confidential (web) clients need
  HTTPS everywhere, localhost included, and only public clients may use http on
  localhost.

### Security

- **Dependency upgrades for published advisories.** Next.js 16.2.1 to 16.4.0 (and
  `eslint-config-next`): fixes the critical remote code execution advisories in image
  optimization (GHSA-2xp9-vwfh-vxw4), `next/og` (GHSA-vcvr-r3jv-pc5j, used for the
  Open Graph images) and GHSA-p293-qw3h-jr36, plus the high and moderate middleware/proxy
  bypass, cache poisoning, SSRF and denial of service advisories; it also brings PostCSS
  8.5.23. sharp 0.34.5 to 0.35.5 (libvips, libheif and librsvg advisories). next-intl
  4.8.3 to 4.14.9 (open redirect GHSA-8f24-v5vv-gm5j, prototype pollution
  GHSA-4c35-wcg5-mm9h). Resend 6.9.4 to 6.32.1, which drops `svix` and its vulnerable
  `uuid`. Development only: Vitest 4.1.11 and tsx 4.23.15. No code or configuration change.
  The new `eslint-config-next` warns about `window.location` navigations to internal pages
  (warnings only; those full reloads are intended).
- **Open redirect after sign-in.** `callbackURL` values such as `/\evil.com` or `/<tab>/evil.com`
  passed the "starts with `/`, not `//`" check, then URL parsing turned them into another
  host: a signed-in visit to `/login` (proxy) and the passkey, two-factor and sign-in code
  paths (client) followed them. One shared check (`packages/core/src/lib/safe-redirect.ts`)
  now refuses backslashes, control characters and surrounding whitespace, resolves the value
  and requires this app's origin or a trusted app's (http/https, no credentials). Also used
  for the app context's resume path.
- **The auth server recovers from a database outage at startup.** Better Auth initialises
  once (the OAuth provider plugin queries the database then) and kept the failed attempt, so
  a database unreachable when the server started meant a 500 on every request until a
  restart. Both apps now rebuild the instance on a later request (at most every 5 seconds)
  and log the failure instead of an unhandled rejection.
- **Client IP off Vercel.** Without `IP_ADDRESS_HEADERS` or `TRUSTED_PROXIES`, a
  single-address `x-forwarded-for` was trusted everywhere, so a client reaching the app
  directly could pick a new IP per request (fresh rate-limit counters, made-up IPs in the
  audit log). It is now trusted by default on Vercel only (`VERCEL=1`). **Upgrading off
  Vercel: set `IP_ADDRESS_HEADERS` or `TRUSTED_PROXIES`** (README, Client IP); without them
  every client shares one rate-limit counter per endpoint, no IP is recorded, and the apps
  log a warning at startup.
- **Stricter Content Security Policy.** Pages of both apps get a per-request nonce from the
  proxy, with `'strict-dynamic'`: no `'unsafe-inline'` or `'unsafe-eval'` for scripts in
  production (`'unsafe-eval'` stays in `next dev` only), plus `object-src 'none'`. Google One
  Tap's sources stay limited to the sign-in and sign-up pages, the captcha's are added as
  before. Every page is now rendered per request (a nonce needs it). API routes and static
  files keep a fixed policy without inline scripts. The `X-Powered-By` header is gone.
- **Invitation emails.** The inviter's and the organization's names are chosen by users;
  they are now cleaned before going into the subject and body: no line breaks, control,
  invisible or bidirectional characters, link-like text broken up (`evil[.]example`), at most
  60 characters, and the organization name quoted. The footnote says the names come from the
  inviter.
- README: what `COOKIE_DOMAIN` implies (the session cookie reaches every subdomain) and how to
  choose the domain; `.env.example` warns too.
- **OAuth client management is for platform admins only.** Better Auth's client endpoints
  (`/oauth2/create-client`, `/oauth2/update-client`, `/oauth2/client/rotate-secret`,
  `/oauth2/delete-client`) are closed over HTTP, and `clientPrivileges` refuses every client
  action (create, read, list, update, rotate, delete) to anyone but a platform admin, also
  for server-side calls. Ordinary users can still register through Dynamic Client
  Registration when it is turned on, with its own limits. The admin console deletes and
  rotates secrets through new routes (`DELETE /api/admin/oauth-clients/<id>`,
  `POST /api/admin/oauth-clients/<id>/rotate-secret`) after its admin check.
- **Admin-registered is an explicit mark (fails closed).** A new
  `oauth_client.admin_registered` column, set by the admin console after it creates a
  client; any client without it is treated as self-registered (consent screen warning, no
  device sign-in, no skipped consent, limited scopes). **Migration
  `0013_oauth_client_admin_registered`** marks existing clients that are not dynamic or
  metadata-document clients and were made by an admin (logged `oauth_client.create` in the
  audit log, owned by a current admin, or without owner); clients ordinary users created
  through Better Auth's endpoints stay self-registered and now show on the Applications page
  with the other self-registered clients, where they can be disabled or deleted.
- **Console-registered clients belong to the platform, not to the admin who created them.**
  They are owned through Better Auth's `clientReference` (`ostiary:platform`, which every
  admin maps to, and nobody else): any admin can edit, rotate or delete them, and an admin
  who loses the role no longer can. The migration moves existing ones (owner cleared).
- **Self-registered clients stay within the self-registration policy.** Updates may not add
  scopes outside the allowed list, grants other than authorization code and refresh token,
  client credentials scopes or skipped consent, whoever makes them.
- **Device sign-in refused to self-registered clients however they authenticate.** The
  check now covers every client named by the request (`client_id`, HTTP Basic, client
  assertion) and runs again when a device code is exchanged.
- **API scopes are bound to their API.** A token for an API that is not restricted could
  carry another API's scopes (`resource=B&scope=apiA:write`). Such scopes are now dropped
  (or the request refused with `invalid_scope`); scopes no API declares, such as
  `OAUTH_API_SCOPES`, are still issued. Restricted APIs are unchanged.
- **The jwt plugin's session JWT is off.** `GET /api/auth/token` is closed and
  `/get-session` no longer sends `set-auth-jwt`: nothing used them, and the session JWT was
  signed with the access tokens' key. `/jwks`, ID tokens and JWT access tokens are unchanged.

- **Accounts, sessions and SSO hardening** (security review of 2026-10-09).
  - `ADMIN_EMAILS` grants the admin role only once the address is verified: a password sign-up
    becomes admin when its verification link (or a sign-in code) is used, a social sign-up only
    when the provider reports the address as verified, and SSO or SCIM never. **Operators:** the
    first sign-up still ends up admin, after opening the verification email.
  - The two-factor step now applies to social sign-ins (including Google One Tap and ID token
    sign-in), SSO (OIDC and SAML) and the sign-in that follows an email verification link, not
    only passwords and sign-in codes, so `REQUIRE_ADMIN_2FA` holds whatever the sign-in method.
    A pending app authorization continues after the code.
  - Implicit account linking (a provider's verified email matching an existing account) is
    refused for accounts with two-factor authentication and for platform admins; they connect
    providers from the account page. **Behavior change** for those accounts: "Continue with
    <provider>" shows "isn't connected yet" until they connect it.
  - Banning an account and resetting its password revoke its OAuth access and refresh tokens
    (audited as `oauth_token.revoke_all`), as SCIM deactivation already did.
  - SSO domains must be one plain hostname, checked with one parser on registration (OIDC and
    SAML) and on edits in the console; a provider whose stored domain is anything else is refused
    at sign-in (edit it and verify it again). The plugin's provider management endpoints
    (`/sso/providers`, `/sso/get-provider`, `/sso/update-provider`, `/sso/delete-provider`,
    `/sso/request-domain-verification`, `/sso/verify-domain`) and the unused shared
    `/sso/callback` are closed: the admin console manages providers.
  - The Public organization's members, invitations, teams and roles are no longer readable or
    changeable by its members (every account); platform admins keep access.
  - Platform roles are limited to `admin` and `user` (`set-role` and `create-user` refuse others,
    such as `"user, admin"`).
  - An impersonating admin can no longer add a passkey to the account or connect a provider.
  - Turnstile and reCAPTCHA tokens are only accepted when solved on the auth app's host.
  - Stored provider secrets require the full 16-byte GCM tag; Amazon Cognito's `email_verified`
    is read strictly (the string `"false"` no longer counts as verified).

## [0.1.1] - 2026-10-07

### Fixed

- First deploy to an empty database: the build now registers the OAuth protected
  resources right after the migrations (`db:seed`). Before, parallel build workers
  and concurrent cold starts raced to insert them, and the losing insert failed with
  a duplicate-key error instead of being ignored.
- README screenshots no longer show the Next.js development badge.
- Account dashboard: "Connected applications" now lists every app the user has
  signed in to. It only listed consents, and first-party clients that skip the
  consent screen never create one, so they never appeared. Disconnecting an app
  removes the consent and revokes the user's tokens for it.

## [0.1.0] - 2026-10-07

### Added

- First public release: OAuth 2.1 / OpenID Connect provider and admin console,
  built on Better Auth 1.7.
