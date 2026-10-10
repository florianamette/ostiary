# Provision users with SCIM

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
