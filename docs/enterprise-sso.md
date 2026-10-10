# Enterprise SSO with SAML 2.0

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
