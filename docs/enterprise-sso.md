# Enterprise SSO (OIDC and SAML 2.0)

Let an organization's people sign in with their company identity provider (Okta, Entra ID, Google Workspace) over OIDC or SAML 2.0.

Enterprise SSO runs on Better Auth's `@better-auth/sso` plugin (samlify underneath for SAML). Ostiary adds the admin console, DNS verification of each domain, checks on SAML metadata and a guard in front of the SAML endpoint.

## How SSO sign-in works

1. The person chooses **Sign in with SSO** on the sign-in page (or opens `https://auth.example.com/sso`) and enters their **Work email**.
2. The email's domain picks the provider. Ostiary sends them to the identity provider.
3. They come back signed in. A new person gets an account; an account with two-factor authentication still stops at the code step.

A provider takes sign-ins only once its email domain is verified with a DNS TXT record, and each domain belongs to one provider. If the provider is attached to an organization, people who sign in through it become members of that organization (see [Organizations](organizations.md#attach-sso-to-an-organization)).

Only platform admins register providers, from the admin console under **SSO**. Better Auth's provider management endpoints are closed to everyone else, and `ADMIN_EMAILS` never grants the admin role through SSO.

## Register an OIDC provider

1. In the admin console, open **SSO**, **Register a provider**, and keep the **OIDC** tab.
2. Fill in:
   - **Provider ID**: a short identifier, e.g. `acme-okta`. It is part of the callback URL.
   - **Issuer URL**: the identity provider's issuer. Ostiary reads `<issuer>/.well-known/openid-configuration` when you register, so it must serve OIDC discovery.
   - **Email domain**: one domain in lowercase, e.g. `acme.com`.
   - **Client ID** and **Client secret** from the app you create at the identity provider.
   - **Organization (optional)**: the organization people join when they sign in.
3. In the identity provider, register the callback URL shown under the form: `https://auth.example.com/api/auth/sso/callback/<provider-id>`.
4. Choose **Register provider**, then [verify the domain](#verify-the-domain).

Ostiary requests the `openid`, `email`, `profile` and `offline_access` scopes (Better Auth's defaults). To change an OIDC provider's client credentials, delete it and register it again.

## Register a SAML 2.0 provider

1. In **SSO**, **Register a provider**, pick the **SAML 2.0** tab.
2. Enter the **Provider ID**, the **Email domain** and, optionally, the **Organization**.
3. Give the service provider values below to the identity provider (see [Okta](#okta) and [Microsoft Entra ID](#microsoft-entra-id)).
4. Give Ostiary the identity provider's configuration and the attribute mapping.
5. Save, then [verify the domain](#verify-the-domain).

Sign-in starts from Ostiary only (SP-initiated).

### Service provider values

Shown with copy buttons on the form and, for each provider, under **SP details**. `<id>` is the provider ID.

| Value | URL |
| --- | --- |
| ACS URL (single sign-on URL, reply URL) | `https://auth.example.com/api/auth/sso/saml2/sp/acs/<id>` |
| SP entity ID (audience URI, identifier) | `https://auth.example.com/api/auth/sso/saml2/sp/metadata?providerId=<id>` |
| SP metadata URL | same as the entity ID |

The SP entity ID of a SAML provider cannot be changed later.

### Identity provider configuration

Under **Identity provider configuration**, choose one:

- **Metadata URL**: fetched once by the server when you save, with the webhook SSRF guard (https, public addresses only, 100 KB, 10 s).
- **Paste metadata XML**: the `EntityDescriptor` your identity provider exports.
- **Enter manually**: IdP entity ID (issuer), the HTTP-Redirect single sign-on URL (https) and the signing certificate (PEM).

The metadata must describe one IdP with an HTTP-Redirect SSO endpoint and a valid, unexpired signing certificate, and no DOCTYPE. An IdP that requires signed requests is refused: Ostiary does not sign AuthnRequests.

### Attribute mapping

Email and display name are required; first and last name are optional (used when sent, otherwise the display name). **Preset** fills in the names for Okta, Microsoft Entra ID (its default claim URIs), Google Workspace and JumpCloud; **Custom** lets you type them.

The user ID is always the assertion's NameID: configure a persistent identifier.

**Require signed assertions** (on by default) needs the assertion itself to be signed. When off, the whole response must still be signed: unsigned responses are always refused.

### Okta

1. In the Okta admin console: **Applications**, **Create App Integration**, **SAML 2.0**.
2. Single sign-on URL: the ACS URL. Audience URI (SP Entity ID): the SP entity ID. Name ID format: Persistent. Application username: Email.
3. Attribute statements: `email` = `user.email`, `firstName` = `user.firstName`, `lastName` = `user.lastName` (the Okta preset).
4. Assign people, then paste the metadata URL from the **Sign On** tab into Ostiary.

### Microsoft Entra ID

1. **Enterprise applications**, **New application**, **Create your own application** (non-gallery), then **Single sign-on**, **SAML**.
2. Basic SAML configuration: Identifier (Entity ID) = the SP entity ID, Reply URL = the ACS URL.
3. Keep the default claims (the Entra ID preset). The default signing option, *Sign SAML assertion*, works.
4. Assign users and groups, then paste the **App Federation Metadata URL** into Ostiary.

### Google Workspace and JumpCloud

Google Workspace (**Apps**, **Web and mobile apps**, **Add custom SAML app**) and JumpCloud work the same way: enter the ACS URL and entity ID, add the email, first name and last name attributes, and paste the IdP metadata. Pick the matching preset.

## Verify the domain

A provider takes no sign-ins until its domain is verified.

1. In **SSO**, choose **Verify domain** on the provider.
2. Ask the domain owner to add the TXT record shown:

   | Name | Value |
   | --- | --- |
   | `_ostiary-<provider-id>.<domain>` (e.g. `_ostiary-acme-okta.acme.com`) | `_ostiary-<provider-id>=<token>` |

3. Choose **Check DNS**. DNS changes can take a few minutes to appear. The value stays valid for 7 days.

The provider then shows **Verified**. Changing a provider's domain later means verifying it again.

## Edit or delete a provider

- **Edit** changes the domain or the organization (and, for OIDC, the issuer). For SAML, **Replace the identity provider configuration** takes new metadata or a new certificate, for example after a certificate rotation. The provider list shows when the signing certificate expires, and warns once it has.
- **Delete** stops sign-ins through the provider. Accounts stay, and people can still use a password or passkey.

Registrations, edits, domain verifications and deletions are in the audit log.

## One provider per domain

The email domain picks the provider at sign-in, so each domain belongs to one provider: the database refuses a second provider with the same domain, in any letter case (`acme.com` and `ACME.com` are the same domain), and the console says "Another SSO provider already uses this domain." To move a domain to a new provider, delete the old provider or change its domain first.

A domain is a single hostname. Older versions could store a comma-separated list (`acme.com,acme.fr`); such a provider takes no sign-ins (only a single, verified hostname does), and the uniqueness check compares the whole stored value, so it does not see that `acme.com,acme.fr` and `acme.com` overlap. Replace each list with one provider per domain.

## What Ostiary checks on SAML responses

On every response:

- an XML signature by the IdP's certificate (unsigned responses are always refused; with **Require signed assertions**, the assertion itself must be signed)
- the audience (SP entity ID), the bearer `Recipient` and the `Destination` (when present) against the ACS URL, and the issuer
- `InResponseTo` against an AuthnRequest this server sent in the last 5 minutes (each usable once), and each assertion ID once (replay)
- `NotBefore` and `NotOnOrAfter` required, with 1 minute of clock skew
- exactly one assertion, SHA-256 or stronger (SHA-1 is refused)
- no DOCTYPE or entity declarations, 256 KB at most

**Not supported**: IdP-initiated sign-in (unsolicited responses are refused; point the IdP's app tile at `https://auth.example.com/sso`), signed AuthnRequests (leave request signing off in the IdP), encrypted assertions and single logout.

## Upgrading from before migration 0014

Migration `0014` adds the one-provider-per-domain rule. If two providers already claim the same domain, it stops before changing anything, and the deployment's migration step fails with:

```
Several SSO providers claim the same domain: acme.com (providers: okta-acme, entra-acme)
```

Nothing is deleted or un-verified for you, because either provider may be the one people sign in with.

1. In the admin console (**SSO**), keep the provider that is verified and in use.
2. Delete the others or change their domain.
3. Deploy again (or run `pnpm db:migrate`).

To list the duplicates yourself:

```sql
SELECT lower(domain) AS domain, string_agg(provider_id, ', ') AS providers
FROM sso_provider GROUP BY lower(domain) HAVING count(*) > 1;
```

## Related

- [Organizations](organizations.md): members and roles, and what attaching a provider does
- [SCIM provisioning](scim.md): let the identity provider create and deactivate accounts
- [Social sign-in](social-sign-in.md)
- [Sign-in methods](sign-in-methods.md)
