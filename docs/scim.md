# Provision users with SCIM

Let an organization's identity provider (Okta, Entra ID and others) create its people's accounts over SCIM 2.0 and deactivate them when they leave.

Each organization except the Public workspace can have one SCIM connection. People the identity provider pushes get an account and become members of that organization. See [Organizations](organizations.md).

## Generate a token

1. In the admin console, open **Organizations** and select the organization.
2. Under **SCIM provisioning**, choose **Generate token**.
3. Copy the **Base URL** and the **Token**. The token is shown once and expires after a year.

The base URL is `https://auth.example.com/api/auth/scim/v2`. The token goes in the identity provider as a bearer token (Okta: API token, Entra ID: secret token). Nothing else reaches the SCIM endpoint: no session, no API key.

## Connect Okta

1. In your app integration, **General** > enable **SCIM provisioning**.
2. Under **Provisioning** > **Integration**:
   - SCIM connector base URL: the base URL, e.g. `https://auth.example.com/api/auth/scim/v2`
   - Unique identifier field for users: `userName`
   - Supported provisioning actions: Push New Users, Push Profile Updates (and Push Groups if you use them)
   - Authentication mode: **HTTP Header**, Authorization: the token
3. Under **Provisioning** > **To App**, enable Create Users, Update User Attributes and Deactivate Users.
4. Assign people to the app.

## Connect Microsoft Entra ID

1. In your enterprise application, **Provisioning** > **New configuration** (or set Provisioning Mode to **Automatic**).
2. Tenant URL: the base URL. Secret token: the token.
3. Choose **Test connection**, then save.
4. Assign users and groups, and start provisioning.

Entra ID sends the email in `userName`; the default attribute mappings work as they are. Its legacy group schema is accepted, so group pushes do not fail.

## Google Workspace

Google Workspace only provisions to apps from its catalog, so it can't push to Ostiary directly. Use its SSO and invite people instead (see [Enterprise SSO](enterprise-sso.md)), or sync Google to Okta or Entra ID first.

## What happens to accounts

- **A new person** gets an account, a membership in the organization (role `member`) and in the Public workspace. They sign in with the organization's SSO, or set a password with **Forgot password?**.
- **An existing account** is linked only when its email is verified and the organization has a verified SSO provider for that email domain. It keeps its own name and email; the directory only controls access. Otherwise the identity provider gets a conflict (409): it can't take over an account by naming its address. Platform admins are never linked, so no organization can deactivate them.
- **Deactivating** (`active: false`) or **deleting** a person keeps the account but bans it ("Your organization has deactivated this account."), signs it out everywhere and revokes its OAuth tokens and personal API keys. Apps lose access at their next refresh.
- **Reactivating** lifts that ban, never one an admin set.
- **Deleting** also removes them from the organization, unless an admin made them owner or admin there.

The organization's page shows how many people are provisioned and deactivated, and marks deactivated members. A person whose account was created by SCIM can't delete it themselves: the directory would create it again. Their IT admin removes them from the directory instead. See [Your data](account-data.md#delete-your-account).

## Replace or revoke the token

- **New token** issues a new token and stops the old one at once. Paste it into the identity provider to keep provisioning.
- **Revoke** stops provisioning. Existing accounts are not changed.

Both are in the audit log (`scim.token_create`, `scim.token_rotate`, `scim.token_revoke`).

Tokens are stored as HMAC digests, keyed with `SCIM_TOKEN_SECRET` (or a key derived from `BETTER_AUTH_SECRET` when it is unset). Changing either one invalidates every SCIM token. See [Configuration](configuration.md).

## Related

- [Organizations](organizations.md)
- [Enterprise SSO](enterprise-sso.md)
- [Webhooks](webhooks.md): `user.banned` and `user.unbanned` with `"source": "scim"`
