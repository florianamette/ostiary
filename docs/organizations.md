# Organizations

Organizations group accounts for B2B use: members with roles, email invitations, and per-organization SSO, SCIM and API keys. Read this to set them up.

Organizations run on Better Auth's `organization` plugin. Platform admins create and manage them from the admin console; an organization's owners and admins invite people from their account dashboard.

## How organizations work

- **The Public workspace.** Every account is a member of a built-in organization, the Public workspace (id `org_public_b2c`, slug `public`), with the role `member`. It is the default B2C workspace: new accounts, imported users and provisioned users all join it. It cannot be deleted, renamed to another slug, or take invitations, and its member list, invitations and member changes are for platform admins only (`PUBLIC_ORGANIZATION_RESTRICTED`). Users never see it in their dashboard.
- **Other organizations** are your customers, partners or teams. An account can belong to any number of them.
- **The active organization.** Each session has one active organization: the Public workspace when the session starts, until the person picks another in the dashboard (**Set active**). It is what the `organization.*` token claims read, see [Put organizations in tokens](#put-organizations-in-tokens).

## Roles

Ostiary uses Better Auth's three default roles, plus the right to manage the organization's API keys:

| Role | Can |
| --- | --- |
| `owner` | Everything, including deleting the organization (Better Auth's endpoints); manage its API keys |
| `admin` | Invite members (only an owner can invite someone as owner), manage members, update the organization; manage its API keys |
| `member` | Belong to it; nothing to manage |

An organization always keeps at least one owner: the admin console refuses to remove or demote the last one ("An organization needs at least one owner. Make another member an owner first.").

These are organization roles. The platform role (`user` or `admin`, which gives access to the admin console) is separate; see [Admin console](admin-console.md).

## Create an organization

Only platform admins can create organizations. The server refuses it for everyone else, whatever the UI.

1. In the admin console, open **Organizations**.
2. Under **Create an organization**, enter the **Organization name** and a **Slug** (letters, digits and dashes; spaces become dashes, and `public` is reserved).
3. Choose **Create organization**.

The admin who creates it becomes its first owner (Better Auth's `creatorRole`). Make someone else owner and remove yourself afterwards if you don't belong there.

## Manage members and invitations

**From the admin console** (platform admins). Open **Organizations** and select the organization:

- **Details**: change the name or slug.
- **Members**: change a member's **Role** (`owner`, `admin`, `member`) or remove them. Their account stays.
- **Invite by email**: enter an address, pick a role (any of the three) and choose **Send invitation**. Pending invitations are listed with their expiry; **Cancel invitation** makes the link stop working.
- **API keys**, **Single sign-on**, **SCIM provisioning**: see the sections below.
- **Recent admin actions**: this organization's entries from the audit log.

Every change is recorded in the audit log (`organization.update`, `organization.update_member_role`, `organization.remove_member`, `organization.invite`, `organization.cancel_invitation`, `organization.delete`).

**From the account dashboard** (owners and admins of the organization). In **Organizations**, make the organization active with **Set active**, then use **Invite a member**: enter an email, pick **Member** or **Admin**, and choose **Send invitation**.

## Accept an invitation

1. The invited person gets an email with a link to `https://auth.example.com/<locale>/accept-invitation/<id>`.
2. They sign in with the invited address (or sign up first, if they have no account).
3. They choose **Accept invitation** and land on their dashboard.

Invitations expire after 48 hours. Accepting needs the session's email to match the invitation, and is refused once the organization has 100 members (Better Auth's default membership limit; SSO and SCIM add members without this check).

## Delete an organization

In **Organizations**, choose **Delete** on the organization's row and confirm. This deletes its memberships, pending invitations and API keys. Member accounts stay. Sessions that had it active fall back to the Public workspace. SSO providers attached to it are kept, with no organization. Each removed membership sends an `organization.member.removed` webhook.

## Attach SSO to an organization

An SSO provider can be attached to an organization when you register or edit it (**Organization (optional)** on the SSO form). Then:

- People who sign in through that provider become members of the organization (role `member`), unless they already are or have a pending invitation.
- Once the provider's domain is verified, a social sign-in with a verified address on that domain also adds the person as a member.
- SCIM can link existing accounts on that domain, see below.

The organization's page in the admin console lists its providers under **Single sign-on**. See [Enterprise SSO](enterprise-sso.md).

## Provision members with SCIM

Each organization (except the Public workspace) can have one SCIM connection: Okta, Entra ID or another identity provider creates its people's accounts, adds them as members and deactivates them when they leave. Open the organization, **SCIM provisioning**, **Generate token**. See [SCIM provisioning](scim.md).

## Give an organization API keys

Owners and admins of an organization can create API keys the organization owns, from their dashboard (**Organizations**, **API keys** on the organization's row). They keep working when the member who created them leaves. See [API keys](api-keys.md).

## Put organizations in tokens

Tokens carry no organization claims by default. To add them, declare custom claims for the application in the admin console: **Applications** > row menu > **Token claims**. The organization attributes are:

| Attribute | Value |
| --- | --- |
| `organization.id` | ID of the session's active organization |
| `organization.slug` | Its slug |
| `organization.role` | The user's role in it (`owner`, `admin` or `member`) |
| `organizations` | Every organization the user belongs to, oldest membership first, 50 at most: `[{ "id", "slug", "role" }]` |

For example, claims named `org_id` (attribute `organization.id`) and `orgs` (attribute `organizations`) in the access token give:

```json
{
  "org_id": "org_8Kq2",
  "orgs": [
    { "id": "org_public_b2c", "slug": "public", "role": "member" },
    { "id": "org_8Kq2", "slug": "acme", "role": "admin" }
  ]
}
```

Keep in mind:

- The active organization is the Public workspace (`org_public_b2c`, slug `public`) until the person picks another one in their dashboard. The `organizations` list includes the Public workspace too.
- Tokens without a session (client credentials, and introspection of opaque tokens) carry no `organization.*` claims.
- The access token's `role` claim is the platform role, not the organization role.

See [Tokens and claims](tokens-and-claims.md#custom-claims) for the full claims reference.

## Get notified of membership changes

Webhooks send `organization.member.added`, `organization.member.removed` and `organization.member.role_changed`, with `data.member` (`id`, `organizationId`, `userId`, `role`). Joining the Public workspace sends no event. See [Webhooks](webhooks.md).

## Related

- [Enterprise SSO](enterprise-sso.md)
- [SCIM provisioning](scim.md)
- [API keys](api-keys.md)
- [Webhooks](webhooks.md)
- [Tokens and claims](tokens-and-claims.md#custom-claims)
- [Admin console](admin-console.md#organizations)
