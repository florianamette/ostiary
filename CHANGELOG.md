# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

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

### Fixed

- Admin console: registering or editing an OAuth application showed "Request failed"
  instead of the reason. Better Auth 1.7 puts it in `error_description`, which is now
  shown (for example, a confidential client with an `http://localhost` redirect URI).
- Admin console: the redirect URI hint now says that confidential (web) clients need
  HTTPS everywhere, localhost included, and only public clients may use http on
  localhost.

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
