# Your data: export and account deletion

Every user can download what Ostiary stores about them and delete their account from the
dashboard (**Your data**), covering the GDPR rights of access and portability (articles 15
and 20) and erasure (article 17). Admins can also export a user's data from the user's page
in the console, to answer a request made another way.

**Export.** One JSON file (`ostiary-account-<id>-<date>.json`, `"format":
"ostiary.account-export"`). It needs a sign-in from the last 10 minutes, is refused while an
admin impersonates the account, is limited to 3 per account per hour, and each export (the
user's or an admin's) is in the audit log. History sections hold at most 5,000 entries each.
Every table, and what the export takes from it:

| Table | In the export | Never exported |
| --- | --- | --- |
| `user` | `profile` (name, email, verification, username, picture, role, ban status, dates), `emails`, `twoFactor.enabled` | |
| `account` | `signInMethods`: provider, kind (password, social, enterprise SSO), provider's account id, scopes, dates; `passwordSet` for passwords | password hash, provider access/refresh/ID tokens |
| `passkey` | `passkeys`: id, name, device type, backed up, transports, authenticator model (AAGUID), created | public key, credential ID, counter (useless outside this server, and identifiers of the authenticator) |
| `two_factor` | `twoFactor`: method, lock | TOTP secret, backup codes |
| `session` | `sessions`: created, last active, expiry, IP, user agent, opened by an administrator | session token, session id |
| `oauth_consent`, `oauth_refresh_token`, `oauth_access_token`, `oauth_client` | `connectedApps`: app id and name, consents (scopes, resources, dates), refresh tokens (scopes, dates, revoked), access tokens (count, first and last issued) | token values |
| `oauth_client` (registered by the user) | `registeredApps`: id, name, URIs, scopes, grants, how it was registered | client secret |
| `apikey` (personal) | `apiKeys`: id, name, first characters, API, scopes, use count, dates | the key's digest |
| `apikey` (organization keys the user created) | `organizationApiKeysCreated`: id, name, organization, created | everything else: the key is the organization's |
| `member`, `organization` | `organizations`: id, name, slug, role, joined | |
| `invitation` | `invitations`: sent and received (organization, role, status, dates) | |
| `sso_provider` (registered by the user) | `enterpriseSso.providersRegistered`: provider id, issuer, domain, organization, verified | OIDC/SAML configuration (client secrets, certificates) |
| `scim_subject`, `scim_user`, `scim_group_member`, `scim_group`, `scim_projection_grant` | `directory`: provisioned, user name, names, emails, external id, active, groups, roles | |
| `audit_log` | `auditLog`: entries where the user is the actor or the target user (action, target, details, by you / an administrator / system; IP only on the user's own entries) | administrators' emails and IPs |
| `auth_event` | `signInEvents`: sign-ins, sign-ups, sign-outs, failed sign-ins with the user's email or username | IP of failed attempts (may be someone else's) |
| `verification`, `device_code` | | pending codes and links: secrets, and gone within minutes |
| `jwks`, `oauth_resource`, `oauth_client_resource`, `oauth_client_assertion`, `app_setting`, `social_provider`, `app_icon`, `oauth_client_branding`, `rate_limit`, `scim_managed_*`, `scim_connection_binding`, `scim_identity_tombstone`, `webhook_endpoint`, `webhook_delivery` | | instance configuration, secrets or counters keyed by IP, not data about the user (a tombstone is a former identity's record) |

**Deletion.** **Delete my account** explains what happens, asks the person to type their email
address and their password (accounts without a password need a sign-in from the last 10
minutes instead), then emails a link (Better Auth `deleteUser` with
`sendDeleteAccountVerification`, valid 60 minutes, once). The link opens a page where the
signed-in person confirms; opening it alone deletes nothing, so mail scanners that follow links
cannot delete accounts, and Better Auth's `GET /delete-user/callback` is closed. `/delete-user`
is limited to 5 requests per 10 minutes per IP. Refused (on the dashboard and by the API):

- **Admins.** Another admin removes the admin role first. There is then always at least one
  admin, and losing admin rights is a decision someone else makes, on record.
- **The only owner of an organization.** Another member becomes owner first, or an admin
  deletes the organization: no organization is left without someone who can manage it.
- **Accounts provisioned by SCIM.** The directory would create the account again on its next
  sync; the person's IT admin removes them in the directory, which deactivates them here. The
  admin console shows this on the user's page.
- While an admin is impersonating the account.

What goes, and what stays:

- Deleted with the account (foreign keys, cascade): sessions, sign-in methods, passkeys,
  two-factor secrets, personal API keys, OAuth tokens and consents, device codes,
  memberships, invitations the user sent, SCIM records, and apps the user registered
  themselves (Dynamic Client Registration). Also deleted: pending codes and links, invitations
  sent to the address, and sessions the person opened while impersonating someone.
- Kept, without the person: **audit log** entries stay, because who changed what must stay
  answerable for the instance (GDPR article 17(3)(b) and (e)), but the actor's email and the
  target's label become `[deleted user]`, the person's IP addresses are removed, and their
  email, username and name are replaced in entry details. The account id remains as the
  pseudonymous key tying entries together; nothing resolves it to a person any more.
  **Sign-in events** keep their type and time for the charts, without IP or identifier.
- Kept, as they belong to the instance or an organization: apps and SSO providers an admin
  registered from the console (their owner is cleared instead of the app being deleted with
  every user's tokens), organization API keys the person created (creator cleared), settings
  they changed.
- Webhooks: `user.deleted` and `organization.member.removed` (except the default Public
  workspace) are sent. Payloads of deliveries already sent are redacted to their envelope; the
  `user.deleted` event itself carries the usual user snapshot (id, email, name) so apps can
  find the account, and is purged with the delivery log after 30 days.
- Already issued JWT access tokens stay valid at resource servers that verify them offline
  until they expire (`ACCESS_TOKEN_EXPIRES_IN`); UserInfo, introspection and refresh refuse
  them at once.

The erasure runs as a database hook on every account deletion, so an admin's **Remove** in the
console applies the same rules (without the self-service restrictions). Code:
`packages/core/src/lib/account-data/`; the test `account-data.test.ts` fills every table that
can refer to an account, deletes it, and checks that no column still holds the person's email,
username or name.
