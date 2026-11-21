# Connect an app

Register your app in the admin console and sign users in with any OpenID Connect library. Covers client types, redirect URIs, device sign-in, sign-out and per-app branding.

Ostiary is a standard OpenID Connect provider. Your app needs three things:

| Setting | Value |
| --- | --- |
| Issuer | `https://auth.example.com/api/auth` |
| Discovery document | `https://auth.example.com/api/auth/.well-known/openid-configuration` |
| Client ID (and secret) | From **Applications** in the admin console |

Replace `auth.example.com` with the address of your auth app (`AUTH_APP_URL`). Locally, the issuer is `http://localhost:3000/api/auth`. [Tokens and claims](tokens-and-claims.md) lists every endpoint, scope and claim.

## Register the app

1. In the admin console, open **Applications** and click **Register application**.
2. Fill in the form:

   | Field | What to enter |
   | --- | --- |
   | **Application name** | Shown on the consent screen and in users' **Connected apps**. |
   | **Client type** | **Confidential (client secret)** or **Public (PKCE, no secret)**. See below. **Machine-to-machine (client credentials)** is for a service that calls your APIs without a user: see [Protect an API](protect-an-api.md#call-an-api-from-a-server-machine-to-machine). |
   | **Redirect URIs** | Where Ostiary sends users back after sign-in, one per line or comma-separated. See the rules below. |
   | **Icon URL** | Optional. See [Set the app icon](#set-the-app-icon). |
   | **Device sign-in (CLIs, TVs)** | Adds the device code grant. See [Sign in from a CLI or a TV](#sign-in-from-a-cli-or-a-tv-device-flow). |
   | **Sign-out from the app (RP-initiated logout)** | Ticked by default. Lets the app end the user's Ostiary session when they sign out of it. See [Sign users out](#sign-users-out-rp-initiated-logout). |
   | **Post-logout redirect URIs (optional)** | Shown while sign-out is ticked. Where Ostiary may send users back after sign-out, one per line or comma-separated. |
   | **Skip consent (trusted client)** | Users never see the consent screen for this app. Use it only for your own first-party apps. |

3. Click **Create application**. Copy the **Client ID** and, for a confidential client, the **Client secret**: it is shown once.

Every registered app uses the authorization code flow with PKCE, which Ostiary requires from confidential clients too, and can get refresh tokens. It can ask for the OpenID Connect scopes (`openid`, `profile`, `email`, `offline_access`) and the scopes of your [APIs](protect-an-api.md). Ask for `offline_access` to get a refresh token.

### Choose a client type

| | Confidential | Public |
| --- | --- | --- |
| For | Apps with a server that can keep a secret: Next.js, Remix, Rails, Django | Apps that cannot keep a secret: single-page apps, mobile and desktop apps, CLIs, and local development |
| Authenticates with | Client secret, sent with HTTP Basic (`client_secret_basic`) | PKCE only (`token_endpoint_auth_method: none`) |
| Redirect URIs | HTTPS on a public host | HTTPS, `http://` on loopback, or a custom scheme |

A confidential client cannot use `localhost` at all, even over HTTPS. For local development, register a separate public client.

> [!WARNING]
> Ostiary only accepts the authentication method a client was registered with. Clients created from the console use HTTP Basic. Some libraries send the secret in the request body (`client_secret_post`) by default, and the token request then fails with `invalid_client` ("client registered for client_secret_basic cannot use client_secret_post"). The examples below set the method explicitly.

### Redirect URI rules

Ostiary compares redirect URIs exactly, character for character, except for the port of a loopback address.

| Redirect URI | Confidential | Public |
| --- | --- | --- |
| `https://app.example.com/callback` | Yes | Yes |
| `https://localhost:3002/callback` | No | No |
| `http://localhost:3002/callback`, `http://127.0.0.1:3002/callback`, `http://[::1]:3002/callback` | No | Yes, on any port |
| `http://app.example.com/callback` | No | No |
| `com.example.app:/callback` (reverse-domain custom scheme) | No | Yes |
| Any URI with a `#fragment` or `user:password@` | No | No |

For a loopback redirect URI, the app may use another port at sign-in than the one registered (RFC 8252), which suits CLIs that pick a free port.

### Change or remove an app

Open **Applications**, then the row's menu (**Actions for** the app):

- **Edit application**: name, redirect URIs, icon, device sign-in, sign-out and skip consent (name and icon only for a machine-to-machine client). The client type cannot change: register a new app instead.
- **Rotate secret**: issues a new secret for a confidential client. The previous one stops working immediately.
- **Delete application**: removes the client. Its tokens and consents may stop working.
- **Sign-in branding** and **Token claims**: see [Brand the sign-in page per app](#brand-the-sign-in-page-per-app) and [Tokens and claims](tokens-and-claims.md#custom-claims).

Admins can also register clients with the JSON API the console uses, `POST /api/admin/oauth-clients`. See [Protect an API](protect-an-api.md#register-a-machine-client) for an example.

## Sign in with Auth.js

[Auth.js](https://authjs.dev) v5 (`next-auth@beta`) in a Next.js app. Its callback URL is `https://app.example.com/api/auth/callback/ostiary`: register that as the redirect URI.

```ts
// auth.ts: a confidential client
import NextAuth from "next-auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    {
      id: "ostiary",
      name: "Ostiary",
      type: "oidc",
      issuer: "https://auth.example.com/api/auth",
      clientId: process.env.OSTIARY_CLIENT_ID,
      clientSecret: process.env.OSTIARY_CLIENT_SECRET,
      // Auth.js sends the secret with HTTP Basic by default, as Ostiary expects.
    },
  ],
});
```

For a public client, drop `clientSecret` and add `client: { token_endpoint_auth_method: "none" }`, as in the [Quickstart](quickstart.md#sign-in-from-your-app). Auth.js uses PKCE in both cases.

To ask for more scopes, for example a refresh token or an API scope, set them on the authorization request:

```ts
authorization: { params: { scope: "openid profile email offline_access" } },
```

## Sign in with Better Auth

If your app runs [Better Auth](https://www.better-auth.com), add Ostiary with the generic OAuth plugin (Better Auth 1.7):

```ts
// lib/auth.ts
import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";

export const auth = betterAuth({
  // ...your database and other options
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "ostiary",
          discoveryUrl: "https://auth.example.com/api/auth/.well-known/openid-configuration",
          clientId: process.env.OSTIARY_CLIENT_ID!,
          clientSecret: process.env.OSTIARY_CLIENT_SECRET!,
          // Better Auth sends the secret in the body by default; Ostiary's clients use HTTP Basic.
          tokenEndpointAuth: { method: "client_secret_basic" },
          scopes: ["openid", "profile", "email"],
        },
      ],
    }),
  ],
});
```

Register `https://app.example.com/api/auth/callback/ostiary` as the redirect URI, and start the sign-in from the client:

```ts
await authClient.signIn.social({ provider: "ostiary", callbackURL: "/dashboard" });
```

> [!NOTE]
> Before 1.7, generic OAuth providers used `authClient.signIn.oauth2({ providerId: "ostiary" })` and the callback `/api/auth/oauth2/callback/ostiary`. Check which one your version uses.

## Sign in with openid-client

[openid-client](https://github.com/panva/openid-client) v6 works in any Node.js server (Express, Fastify, Hono):

```ts
import * as client from "openid-client";

const config = await client.discovery(
  new URL("https://auth.example.com/api/auth"),
  process.env.OSTIARY_CLIENT_ID!,
  undefined,
  // openid-client defaults to client_secret_post: use HTTP Basic, as the client was registered.
  client.ClientSecretBasic(process.env.OSTIARY_CLIENT_SECRET!),
);

const redirect_uri = "https://app.example.com/callback";

// 1. Start the sign-in: keep codeVerifier and state in the user's session, then redirect.
export async function startSignIn() {
  const codeVerifier = client.randomPKCECodeVerifier();
  const state = client.randomState();
  const url = client.buildAuthorizationUrl(config, {
    redirect_uri,
    scope: "openid profile email offline_access",
    code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: "S256",
    state,
  });
  return { url, codeVerifier, state };
}

// 2. On the redirect URI: exchange the code.
export async function finishSignIn(currentUrl: URL, codeVerifier: string, state: string) {
  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: codeVerifier,
    expectedState: state,
  });
  return { tokens, user: tokens.claims() }; // claims(): the verified ID token's claims
}
```

For a public client, pass `client.None()` instead of `ClientSecretBasic(...)`. Against a local `http://localhost` issuer, add `{ execute: [client.allowInsecureRequests] }` as the fifth argument of `discovery`.

## Other libraries

Any certified OpenID Connect relying party library works: AppAuth on iOS and Android, `oidc-client-ts` in a browser, Spring Security, `authlib` in Python, `omniauth_openid_connect` in Ruby. Give it:

- the issuer or discovery URL above,
- the client ID, and the secret for a confidential client sent with HTTP Basic (`client_secret_basic`),
- PKCE with `S256`: Ostiary requires it from every client registered in the console, confidential ones included (`pkce is required for this client` otherwise),
- the scopes, at least `openid`.

ID tokens are signed with EdDSA (Ed25519): the library must support it, and read the keys from the JWKS. [Tokens and claims](tokens-and-claims.md#signing-keys) covers the keys and their rotation.

## Sign in from a CLI or a TV (device flow)

Apps that cannot open a browser use the device authorization grant (RFC 8628). The user approves the app on another screen.

1. Register the app, usually as a public client, and tick **Device sign-in (CLIs, TVs)**. For an existing app, turn it on in **Edit application**. Only apps registered by an admin can use device sign-in. The discovery document then lists `device_authorization_endpoint`.
2. The app asks for a code:

   ```bash
   curl -s https://auth.example.com/api/auth/device/code \
     -d client_id=$CLIENT_ID \
     -d scope="openid profile email offline_access"
   ```

   ```json
   {
     "device_code": "...",
     "user_code": "WDJBMJHT",
     "verification_uri": "https://auth.example.com/device",
     "verification_uri_complete": "https://auth.example.com/device?user_code=WDJBMJHT",
     "expires_in": 600,
     "interval": 5
   }
   ```

3. The app shows `user_code` (for example as `WDJB-MJHT`: case and dashes do not matter) and `verification_uri`, or a QR code of `verification_uri_complete`. The user opens the page, signs in if needed, checks the app and the scopes, and approves.
4. Meanwhile the app polls the token endpoint every `interval` seconds:

   ```bash
   curl -s https://auth.example.com/api/auth/oauth2/token \
     -d grant_type=urn:ietf:params:oauth:grant-type:device_code \
     -d device_code=$DEVICE_CODE \
     -d client_id=$CLIENT_ID
   ```

   | Answer | What the app does |
   | --- | --- |
   | `authorization_pending` | Keep polling. |
   | `slow_down` | Poll 5 seconds less often. |
   | Tokens | Done: an access token, an ID token with `openid`, a refresh token with `offline_access`. |
   | `access_denied` | The user refused. |
   | `expired_token` | The 10 minutes are over: start again. |

A confidential client also sends its secret on both requests. The user always approves on the page, even for apps with **Skip consent**.

## Sign users out (RP-initiated logout)

Signing out of your app only clears your app's own session: the user stays signed in to Ostiary, and the next sign-in goes through without a password. To end the Ostiary session too, the app sends the user to the end-session endpoint (OpenID Connect RP-Initiated Logout 1.0).

1. Tick **Sign-out from the app (RP-initiated logout)** when you register the app, or turn it on in **Edit application**. Apps registered before this option existed have it off.
2. Add the page to come back to under **Post-logout redirect URIs (optional)**, for example `https://app.example.com/`. Ostiary compares it exactly, like redirect URIs.
3. When the user signs out, clear your app's session, then redirect the browser to:

   ```text
   https://auth.example.com/api/auth/oauth2/end-session
     ?id_token_hint=<the ID token from sign-in>
     &post_logout_redirect_uri=https://app.example.com/
     &state=<optional, returned as is>
   ```

With a valid `id_token_hint` for the session in that browser, Ostiary ends the session at once and redirects to `post_logout_redirect_uri` (with `state` when you sent one). Without a hint, or with a hint for another session, the user confirms on an Ostiary page first. A `post_logout_redirect_uri` that is not registered is ignored: the user sees a signed-out page instead.

Ending the session also revokes the access tokens issued on it, and its refresh tokens unless they were issued for `offline_access`. The ID tokens of an app with sign-out carry the session ID (`sid`).

An app without sign-out gets `401 invalid_client` ("The client is not allowed to initiate logout"). Most libraries read `end_session_endpoint` from the discovery document: Auth.js and Better Auth leave the call to you, openid-client builds the URL with `client.buildEndSessionUrl(config, { id_token_hint, post_logout_redirect_uri })`.

## Set the app icon

Ostiary shows each app's icon in the admin console, on the consent screen and in users' **Connected apps**. It uses, in order:

1. the registered `logo_uri` (**Icon URL**),
2. the icon of the app's site: its `client_uri`, else the first HTTPS redirect URI on a public host,
3. a colored monogram.

Apps that only redirect to `localhost`, `127.0.0.1` or a custom scheme (CLIs, desktop apps, local development) have no site, so set **Icon URL** when you register the app or in **Edit application** (`logo_uri` in `POST` and `PATCH /api/admin/oauth-clients`). The URL must be HTTPS on a public host and the default port, and point to a PNG, JPEG, WebP, AVIF, GIF, ICO or SVG image. Ostiary fetches the image itself; browsers never load it from there. Leave the field empty to remove the icon.

For a self-registered client (see [MCP and AI agents](mcp-and-agents.md)), the row's menu has **Set icon**. The consent screen still shows such an app's monogram and the **Unverified app** notice.

## Brand the sign-in page per app

When someone arrives from one of your apps, the sign-in screens can show that app: "Sign in to continue to **Your app**", its logo, its accent color on the buttons and focus ring, and an optional tagline. On wide screens, the dark side panel can show the app's own headline and background image. Without an app (someone opening `/login` directly), the screens keep the global brand.

### Set the branding

1. Open **Applications**, then the row's menu, then **Sign-in branding**.
2. Set any of these, and check the live **Preview** in light and dark:

   | Setting | Details |
   | --- | --- |
   | **Display name** | Replaces the application name on the sign-in screens and the consent card. |
   | **Tagline (optional)** | A line under the title. |
   | **Logo** | The **App icon**, an image **From a URL** (HTTPS on a public host, fetched and cached by Ostiary), or an **Upload** (PNG, JPEG, WebP, AVIF, GIF, ICO or SVG, 256 KB at most). |
   | **Accent color** | A hex color. See the contrast checks below. |
   | **Side panel (wide screens, optional)** | A headline and a background image (PNG, JPEG, WebP or AVIF, 1 MB at most). |
   | **Social sign-in on this app's screens** | **All enabled** providers, or **Only these**. Google One Tap follows Google. This only hides buttons; it does not stop anyone from signing in another way. |

3. Click **Save branding**. **Reset to default** removes it.

The branding applies to login, sign-up, two-factor, password reset and consent. Browsers load the logo and side panel image from Ostiary (`/api/app-branding/<client_id>/...`), never from the app's servers. Changes are in the audit log as **Changed sign-in branding** and **Reset sign-in branding**.

**Contrast checks.** The console shows the accent's contrast. Button labels get black or white, whichever reaches WCAG AA. Text drawn in the accent is darkened or lightened per color scheme until it reaches 4.5:1. The console warns when the buttons themselves are below 3:1 against the light or dark card.

### How Ostiary knows which app a screen is for

Better Auth's OAuth provider sends the browser to `/login`, `/consent` and `/select-account` with the authorization request in the query, signed with `BETTER_AUTH_SECRET`. Ostiary checks that signature, and that `client_id` is one of the signed parameters, before it shows any app. A `?client_id=` typed into a link, or a signed request with its `client_id` edited, shows the default screen.

Sign-up, password reset and the email links carry a short-lived app context token instead (`app=`, signed with a key derived from the same secret, valid 2 hours). The flow continues after the email step: verifying a new account or resetting a password brings the user back to the app. The two-factor step keeps the signed request, and the device page shows the app once the code names a pending request.

### Anti-phishing rules

- Only apps registered by an admin get custom branding. A self-registered client (Dynamic Client Registration or a metadata document) gets its name with an **Unverified app** warning and a monogram, whatever is stored.
- Ostiary's own mark stays at the top of every screen and "Secured by Ostiary" at the bottom, so people can tell which identity provider they are typing their password into. The side panel keeps the Ostiary theme.

### Forks with their own theme

The accent reaches the form column only, through four CSS variables on `[data-app-brand="accent"]` in `packages/core/src/styles/globals.css`: `--app-accent`, `--app-accent-foreground`, `--app-accent-text-light` and `--app-accent-text-dark`, mapped to `--primary`, `--primary-foreground` and `--ring`. Override that block to change what the accent reaches, or empty it to ignore app accents. Contrast is computed against Ostiary's card colors (`#ffffff` light, `#141311` dark); a fork with very different cards should check its own.

## Related

- [Protect an API](protect-an-api.md): access tokens for your own APIs, and machine-to-machine clients.
- [Tokens and claims](tokens-and-claims.md): endpoints, scopes, claims, [custom claims per application](tokens-and-claims.md#custom-claims) and [signing keys](tokens-and-claims.md#signing-keys).
- [MCP and AI agents](mcp-and-agents.md): clients that register themselves.
- [Social sign-in](social-sign-in.md): social providers and Google One Tap.
- [Troubleshooting](troubleshooting.md): `redirect_uri` mismatches and other errors.
