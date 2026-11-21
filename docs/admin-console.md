# Admin console

A page-by-page tour of the admin console (`apps/admin`), where platform admins manage users, applications, APIs, sign-in and security, and who can open it.

## Who can use the console

The console is for platform admins: accounts with the `admin` role. Platform roles are `admin` and `user` only.

There are two ways to become an admin:

- **First run.** Put your address in `ADMIN_EMAILS` (auth app), then sign up. The account gets the `admin` role once the address is proven: by the verification link or a sign-in code, or at sign-up through a social provider that reports the address as verified. SSO and SCIM never make an admin. See [Quickstart](quickstart.md).
- **From the console.** Another admin opens **Users**, then the row menu > **Make admin**. **Make user** takes the role away.

The console has no sign-in page of its own. Every visit goes through these checks, in the proxy and again in the console's layout:

| Visitor | What happens |
| --- | --- |
| Signed out | Sent to the auth app's login page, then back to the page asked for |
| Signed in, not an admin | Sent to their account dashboard on the auth app |
| Admin without two-factor authentication, while `REQUIRE_ADMIN_2FA` is `true` (the default) | Sent to `/dashboard#two-factor` on the auth app, which shows **Turn on two-factor authentication**: "Admins need two-factor authentication to open the admin console." |
| Admin with two-factor authentication (or `REQUIRE_ADMIN_2FA=false`) | The console opens |

The admin endpoints follow the same rules: an admin without two-factor authentication gets `403` with code `TWO_FACTOR_REQUIRED` ("Turn on two-factor authentication to use admin features."). Their own account keeps working. Set `REQUIRE_ADMIN_2FA` to the same value in both apps.

For one sign-in across both apps in production, they need a shared parent domain in `COOKIE_DOMAIN`: read [COOKIE_DOMAIN](security.md#cookie_domain) first. Admins reach the console from the **Admin** item of the account menu on the auth app (set `NEXT_PUBLIC_ADMIN_APP_URL` for it to point to the console).

## Find your way around

The sidebar has two groups. Pages live under the locale, e.g. `https://admin.example.com/en/users`.

| Group | Pages |
| --- | --- |
| **Admin** | **Overview**, **Users**, **Organizations**, **SSO**, **Sign-in providers**, **Webhooks**, **Security**, **App usage**, **Audit log** |
| **OAuth** | **Applications**, **APIs**, **API keys**, **Consent**, **Signing keys** |

The user menu at the bottom of the sidebar has **Home** (your account dashboard on the auth app) and **Log out**.

Every change made in the console is recorded in the **Audit log**. Settings that the auth app caches (self-registration, API key settings, scopes, signing key rotation) reach it within a minute; social provider changes within 30 seconds.

## Overview

The landing page: tiles for **Total users**, **Administrators**, **Banned**, **Verified email** and **New (7 days)**, a **Sign-in activity** chart (sign-ins, sign-ups and sign-outs per day over the last 30 days, also as a table with **View as table**), and **Recently joined**, the newest accounts.

## Users

Find accounts, change roles, ban or remove them.

- Search by name or email, and filter by **Role** (**All roles**, **Admin**, **User**).
- **Add user** creates an account with an email, a password, a name and a role.
- **Export CSV** downloads the users that match the current search and role filter (id, email, name, username, role, verification, ban and two-factor status, dates). Up to 100,000 rows per file; past that the file ends with a `# truncated` line. Exports are recorded in the audit log.
- **Import users** opens the import page, see [Import users](import-users.md).

The row menu of each user has **Copy user ID**, **Edit user** (name and email; a new email must be verified before the user can sign in again), **Set password**, **Make admin** or **Make user**, **Ban user** or **Unban user**, and **Remove user**. A ban from the console has no end date. Banning an account also revokes its apps' refresh tokens and its API keys. **Remove user** deletes the account and everything linked to it; audit log entries are kept without the name or email.

### A user's page

Open a user to see the tiles (**Joined**, **Active sessions**, **Passkeys**, **Two-factor**) and these sections:

| Section | What you do there |
| --- | --- |
| **Active sessions** | See each device, IP address and last activity. **Revoke** ends one session. Sessions opened by impersonation are marked **Impersonated** |
| **API keys** | The keys this account created; revoke one |
| **Sign-in methods** | Password, social and SSO accounts, passkeys, and two-factor authentication. **Reset** turns off the user's two-factor authentication (authenticator app, backup codes and trusted devices) when they have lost it |
| **Organizations** | The account's memberships |
| **Recent sign-in activity** | Sign-ins, sign-ups, sign-outs and failed sign-ins |
| **Admin actions on this account** | The audit log entries for this account |

The buttons at the top:

- **Export data** downloads the account's data as JSON, as the user's own export does (recorded in the audit log). See [Your data](account-data.md).
- **Impersonate** signs you in as the user on their account dashboard, for up to an hour; a banner there lets you stop and return. You cannot impersonate yourself or a banned account, and while impersonating you cannot add a passkey, connect a provider or delete the account.
- **Sign out everywhere** ends every session of the user.

An account provisioned by SCIM shows **Provisioned by SCIM**: remove it in the identity provider, otherwise the next sync creates it again.

## Organizations

Every organization on the platform. Search by name or slug, and create one under **Create an organization** (a name and a unique slug; `public` is reserved). Only platform admins can create organizations.

Open an organization to:

- Change its name and slug under **Details**.
- Manage **Members**: change a member's role (owner, admin, member) or remove them. Every account belongs to the Public workspace, so its members cannot be removed.
- **Invite by email**, and cancel pending invitations.
- See and revoke the organization's **API keys**.
- See its **Single sign-on** providers.
- Set up **SCIM provisioning** (not on the Public organization): **Generate token**, then **Replace token** or **Revoke**. A token is shown once and expires in one year.

See [Organizations](organizations.md) and [SCIM](scim.md).

## SSO

Connect an organization's identity provider over OIDC or SAML 2.0.

1. Under **Register a provider**, choose the **Protocol**, enter a **Provider ID** (e.g. `acme-okta`), the **Email domain** and the identity provider's details, and optionally an **Organization**.
2. Copy the callback URL (OIDC) or the SAML values (**ACS URL**, **SP entity ID**, **SP metadata URL**) into the identity provider.
3. Under **Configured providers**, click **Verify domain**, publish the TXT record shown, then **Check DNS**. A provider only accepts sign-ins once its domain is verified.

See [Enterprise SSO](enterprise-sso.md).

## Sign-in providers

Social sign-in (Google, Apple, Microsoft and 30+ others). Pick a provider in **Providers**, create an OAuth app with it using the **Callback URL** shown, paste its credentials and turn on **Show on the sign-in page**. **On the sign-in page** lists the active ones, in the order of the sign-in buttons; reorder them there. Each provider also has **Create accounts for new users**, and Google has **Show Google One Tap**. A provider set by environment variables (GitHub) shows **Set by environment variables** and is read-only. See [Social sign-in](social-sign-in.md).

## Webhooks

Signed HTTPS notifications when users, roles and organization memberships change.

- **Add an endpoint**: a URL and the **Events** to send. Copy the signing secret then: it is not shown again.
- On each endpoint: **Send test event**, **Delivery log** (with **Redeliver**), **Regenerate secret** (the old secret keeps signing for 24 hours), edit, disable or delete.

See [Webhooks](webhooks.md).

## Security

Failed sign-ins over 24 hours and 7 days, **Failed sign-ins per day** over 30 days, **Most targeted accounts, 7 days**, **Busiest IP addresses, 7 days** (one address trying many accounts usually means credential stuffing), and **Banned accounts**. The IP addresses depend on the client IP settings, see [Client IP](security.md#client-ip).

## App usage

Which applications are used: tokens issued, users and consents per application over the last 30 days, and the applications that issued no token in that time (**Unused**). **Show in Applications** jumps to the application.

## Audit log

Every change made from the console or the admin API: who did it, to what, when, and from which IP. Passwords and secrets are never recorded.

- **Filter by area** (Users, Organizations, OAuth clients, Consents, APIs, API keys, SSO, Signing keys, Webhooks, Sign-in providers) and search by who acted (email).
- **Export CSV** downloads every entry matching the filter and search, with the same 100,000-row limit as the users export. The export itself is recorded.

## Applications

The OAuth clients that sign people in, and the machine-to-machine clients that call your APIs.

- **Register application**: a name, the **Client type** (**Confidential (client secret)**, **Public (PKCE, no secret)** or **Machine-to-machine (client credentials)**), **Redirect URIs**, an optional **Icon URL**, **Device sign-in (CLIs, TVs)**, **Sign-out from the app (RP-initiated logout)** (ticked by default) with its optional **Post-logout redirect URIs**, and **Skip consent (trusted client)**. A machine-to-machine client has no redirect URIs, device sign-in, sign-out or consent: you tick its scopes under **APIs and scopes** instead, and it is linked to their APIs. Copy the client secret when it is shown.
- The row menu of each application has **Copy client ID**, **Edit application** (the same settings, except the client type), **Sign-in branding**, **Token claims**, **Rotate secret** (confidential clients) and **Delete application**.
- Search and filter by client type (including **Machine-to-machine**) and by who registered it.

The **Self-registration** card (**Edit**) controls Dynamic Client Registration and Client ID Metadata Documents for MCP clients and AI agents: who may register, the scopes they may request, the hourly cap and the reuse of identical public clients. Self-registered clients are marked **Self-registered**; their row menu can enable, disable, set an icon or delete them, and **Remove unused duplicates** cleans them up.

See [Connect an app](connect-an-app.md), [Tokens and claims](tokens-and-claims.md) for **Token claims**, and [MCP and agents](mcp-and-agents.md).

## APIs

Your APIs (protected resources) that accept access tokens. **Register an API** with an **Identifier** (usually its base URL; it cannot be changed later), a name and its **Scopes**. Then, on each API:

- Edit its name and scopes, restrict tokens to its own scopes (**Only issue these scopes for this API**), or disable it.
- **Applications** > **Change**: let every application get tokens for it, or **Only linked applications**. Others get `invalid_target`.
- **Tokens** > **Change**: shorter access and refresh token lifetimes, custom claims, and **Require DPoP-bound tokens**.

Scopes from `OAUTH_API_SCOPES` are listed apart: they apply to every API. See [Protect an API](protect-an-api.md).

## API keys

Keys people create from their account for one of your APIs. **Edit** turns them on or off (**Allow API keys**) and sets the **Maximum lifetime**. **All keys** lists every key with its owner, API, scopes, last use and expiry; **Revoke** stops one at once. See [API keys](api-keys.md).

## Consent

The permissions people have granted to OAuth clients, with the scopes and dates. Search by user, client, consent ID or scope, filter by scope, and **Revoke consent**, which also revokes the tokens issued under it.

## Signing keys

The keys ID tokens and JWT access tokens are signed with, and the **JWKS URL** apps verify them against.

- **Automatic rotation** > **Edit**: how often the key is replaced (**Rotate the key**) and the **Grace period** a retired key stays published.
- **Rotate now** replaces the key at once. Tokens already signed stay valid while the old key is published.
- **Keys** lists each key ID, algorithm, dates and status. Private keys are stored encrypted and never shown.

See [Tokens and claims](tokens-and-claims.md).

## Related

- [Configuration](configuration.md#admins): `ADMIN_EMAILS` and `REQUIRE_ADMIN_2FA`
- [Security](security.md#admins-and-roles)
- [Troubleshooting](troubleshooting.md)
