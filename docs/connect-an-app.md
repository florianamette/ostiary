# Connect an app

Ostiary is a standard OpenID Connect provider. Register a client in the admin console (**Applications**), then point your app at the discovery document:

```
https://<your-ostiary-domain>/api/auth/.well-known/openid-configuration
```

For example, with [Auth.js](https://authjs.dev) in a Next.js app:

```ts
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
    },
  ],
});
```

Any OIDC library works the same way (Better Auth's generic OAuth, `openid-client`, AppAuth on mobile): give it the issuer, client ID and secret.

To protect an API, register it in the admin console under **APIs**: its identifier (usually its URL) and the scopes clients may request for it. Clients request a token for it with the `resource` parameter, and the API verifies the JWT against Ostiary's JWKS. New scopes reach the auth server within a minute, no redeploy needed. You can also declare APIs with `OAUTH_API_AUDIENCES` and scopes with `OAUTH_API_SCOPES`, for example to provision a new instance.

Every application can get tokens for an API by default. To limit an API to some applications, open **Change** next to *Applications* and pick **Only linked applications**, then check the applications that may call it; the others get `invalid_target`. Linked applications can also introspect the API's tokens. **Change** next to *Tokens* sets the API's access and refresh token lifetimes (shorter than the defaults of 1 hour and 30 days), custom claims added to its tokens (a JSON object, e.g. `{"tenant": "acme"}`), and whether tokens must be DPoP-bound, in which case the API must check the DPoP proof.

## Signing keys and rotation

ID tokens and JWT access tokens are signed with an Ed25519 key; apps and APIs verify them against the public keys at `https://<your-ostiary-domain>/api/auth/jwks` (the `jwks_uri` of the discovery document). The admin console's **Signing keys** page lists the keys (key ID, algorithm, dates and whether each one is current, still published for verification, or expired) and never shows private keys, which are stored encrypted with `BETTER_AUTH_SECRET`.

- **Rotate now** creates a new key that signs every token from then on. The previous key stays in the JWKS for the grace period, so tokens it signed keep verifying until they expire.
- **Automatic rotation** (off by default) replaces the key every 30, 90, 180 or 365 days. The new key is created when the first token is signed after the current one reaches that age.
- **Grace period** (default 30 days, as before): how long a retired key stays published. Keep it longer than your longest token lifetime (access tokens: 1 hour, ID tokens: 10 hours).

Settings reach the auth server within a minute. Rotation needs nothing from your apps as long as they read keys from the JWKS by `kid` and fetch it again when they meet an unknown one, as `jose`'s `createRemoteJWKSet`, `openid-client`, Auth.js and Better Auth do. Apps that pin a single public key must be updated after each rotation.

## Sign in from a CLI or a TV (device flow)

Apps that cannot open a browser use the device authorization grant (RFC 8628). In the admin console, register the app (usually a public client) and tick **Device sign-in**. The discovery document then lists `device_authorization_endpoint`.

1. The app asks for a code:

   ```bash
   curl -s https://auth.example.com/api/auth/device/code \
     -d client_id=$CLIENT_ID \
     -d scope="openid profile email offline_access"
   # {"device_code":"…","user_code":"WDJBMJHT","verification_uri":"https://auth.example.com/device",
   #  "verification_uri_complete":"https://auth.example.com/device?user_code=WDJBMJHT","expires_in":600,"interval":5}
   ```

2. It shows `user_code` (for example as WDJB-MJHT, the dash is optional) and `verification_uri` (or a QR code of `verification_uri_complete`). The user opens the page, signs in if needed, checks the app and the scopes, and approves.

3. Meanwhile the app polls the token endpoint every `interval` seconds:

   ```bash
   curl -s https://auth.example.com/api/auth/oauth2/token \
     -d grant_type=urn:ietf:params:oauth:grant-type:device_code \
     -d device_code=$DEVICE_CODE \
     -d client_id=$CLIENT_ID
   ```

   Until the user decides it gets `authorization_pending` (or `slow_down` when it polls too fast: wait 5 more seconds). Then it gets the usual tokens (access token, ID token with `openid`, refresh token with `offline_access`), or `access_denied`. After 10 minutes the code expires (`expired_token`) and the app starts again. A confidential client also sends its secret on both requests.

The user always approves on the page, even for clients with **Skip consent**.

## Brand the sign-in page per app

When someone arrives from one of your apps, the sign-in screens can show that app, like
Auth0's per-application Universal Login: "Sign in to continue to **Cyber Library**", its logo,
its accent color on the buttons and focus ring, and an optional tagline. On wide screens the
dark side panel can show the app's own headline and background image. Without an app (someone
opening `/login` directly) the screens keep the global brand from `lib/brand.ts`.

Set it in the admin console: **Applications**, the row's menu, **Sign-in branding**.

- **Display name**: replaces the client name on the sign-in screens and the consent card.
- **Logo**: the app's icon (as on the consent screen), an https URL, or an upload (PNG, JPEG,
  WebP, AVIF, GIF, ICO or SVG, 256 KB). A URL is fetched by Ostiary with the same SSRF guard as
  app icons and cached in `app_icon`; uploads are stored in the database. Browsers only ever
  load `/api/app-branding/<client_id>/logo` from Ostiary, never from the app's servers.
- **Accent color**: a hex color. The console shows its contrast: button labels get black or
  white, whichever reaches WCAG AA (one always does); text in the accent is darkened or
  lightened per color scheme until it reaches 4.5:1; and it warns when the buttons themselves
  are below 3:1 against the light or dark card.
- **Side panel**: a headline and an image (PNG, JPEG, WebP or AVIF, 1 MB).
- **Social sign-in**: all enabled providers, or only some (Google One Tap follows Google). This
  only hides buttons on that app's screens; it does not stop other sign-in methods.

Changes are written to the audit log (**Changed sign-in branding**, **Reset sign-in
branding**). Settings live in the `oauth_client_branding` table, deleted with the client.

**Which app a screen is for.** Better Auth's OAuth provider sends the browser to `/login`,
`/consent` and `/select-account` with the authorization request in the query, signed with
`BETTER_AUTH_SECRET` (`sig`, with `exp` and the list of signed parameters in `ba_param`).
Ostiary checks that signature and that `client_id` is one of the signed parameters before
showing any app; a `?client_id=` typed into a link, or a signed request with its `client_id`
edited, shows the default screen. Sign-up, password reset and the email links get a short-lived
app context token instead (`app=`, HMAC-signed with a key derived from the same secret, 2
hours) plus `callbackURL` set to the authorization request, so the flow continues after the
email step: verifying a new account or resetting a password brings the user back to the app.
The two-factor step keeps the signed request, the email-code step is part of the login page,
and the device page shows the app once the code names a pending request.

**Anti-phishing.** Only clients registered by an admin get custom branding. A client that
registered itself (Dynamic Client Registration or a metadata document) gets its name with an
**Unverified app** warning and a monogram, whatever is stored. Ostiary's own mark stays at the
top of every screen and "Secured by Ostiary" at the bottom, so people can tell which identity
provider they are typing their password into, and the side panel keeps the Ostiary theme.

**Forks with their own theme.** The accent reaches the form column only, through four CSS
variables on `[data-app-brand="accent"]` (see `styles/globals.css`): `--app-accent`,
`--app-accent-foreground`, `--app-accent-text-light` and `--app-accent-text-dark`, mapped to
`--primary`, `--primary-foreground` and `--ring`. Override that block to change what the accent
reaches, or empty it to ignore app accents. Contrast is computed against Ostiary's card colors
(`#ffffff` light, `#141311` dark); a fork with very different cards should check its own.
