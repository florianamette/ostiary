# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Admin console: an **APIs** page to register the APIs (OAuth protected resources)
  that accept access tokens, with the scopes clients may request for each. Scopes
  are read from the database and reach the auth server within a minute, without a
  redeploy. An API can be restricted to its own scopes, or disabled.
  `OAUTH_API_SCOPES` and `OAUTH_API_AUDIENCES` keep working.
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
