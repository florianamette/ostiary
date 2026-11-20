# Quickstart

From nothing to "Sign in with Ostiary" in your app, on your machine, in about ten minutes: run Ostiary, make yourself an admin, register your app and sign in through it. When it works locally, [deploy it](#deploy-it) the same way.

To look around first without installing anything, the [live demo](https://demo.ostiary.dev) has an admin console you can browse (read-only).

## 1. Run Ostiary

You need Node.js 20+, pnpm 11 and a Postgres database (a local one, or a free [Neon](https://neon.tech) database).

```bash
git clone https://github.com/florianamette/ostiary.git && cd ostiary
pnpm install
cp apps/auth/.env.example apps/auth/.env.local
cp apps/admin/.env.example apps/admin/.env.local
```

In both `.env.local` files, set the same two values:

```bash
DATABASE_URL=postgres://...            # your database
BETTER_AUTH_SECRET=...                 # openssl rand -base64 32
```

And in `apps/auth/.env.local`, your address, so your account becomes an admin:

```bash
ADMIN_EMAILS=you@example.com
```

Then create the tables and start both apps:

```bash
pnpm db:migrate
pnpm dev:auth     # sign-in and OIDC provider, http://localhost:3000
pnpm dev:admin    # admin console, http://localhost:3001
```

No email service is needed yet: without Resend, the verification links and sign-in codes are printed in the terminal running `dev:auth`.

## 2. Make yourself an admin

1. Open http://localhost:3000 and sign up with the address you put in `ADMIN_EMAILS`.
2. Open the verification link printed in the terminal. Your account becomes an admin once its address is verified.
3. Open http://localhost:3001. The admin console asks you to turn on two-factor authentication first, with an authenticator app.

## 3. Register your app

In the admin console, open **Applications**, then **Register application**:

- **Application name**: what users see on the consent screen.
- **Client type**: **Public (PKCE, no secret)** for now. A confidential client must use HTTPS redirect URIs, even on localhost.
- **Redirect URIs**: where Ostiary sends users back. For the Auth.js example below, `http://localhost:3002/api/auth/callback/ostiary`.

**Create application** shows the client ID. Copy it.

## 4. Sign in from your app

Ostiary is a standard OpenID Connect provider: any OIDC library only needs the issuer, `http://localhost:3000/api/auth`, and the client ID. With [Auth.js](https://authjs.dev) in a Next.js app:

```ts
// auth.ts
import NextAuth from "next-auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    {
      id: "ostiary",
      name: "Ostiary",
      type: "oidc",
      issuer: "http://localhost:3000/api/auth",
      clientId: process.env.OSTIARY_CLIENT_ID,
      // A public client: no secret, PKCE instead.
      client: { token_endpoint_auth_method: "none" },
      checks: ["pkce", "state"],
    },
  ],
});
```

Run the app on port 3002 (`next dev -p 3002`, since Ostiary uses 3000 and 3001) and call `signIn("ostiary")`. You land on Ostiary's sign-in page, approve the consent screen, and come back signed in.

[Connect an app](connect-an-app.md) goes further: confidential clients, protecting your APIs with access tokens, custom claims, device sign-in for CLIs and per-app branding of the sign-in page.

## Deploy it

- **Vercel**: the *Deploy with Vercel* button in the [README](https://github.com/florianamette/ostiary#vercel) creates the project and a Neon database. The build applies the migrations.
- **Your own server**: [Self-hosting with Docker](self-hosting.md) runs Postgres, both apps and the daily housekeeping job with Docker Compose, behind your reverse proxy.

In production, set `RESEND_API_KEY` and `RESEND_FROM` so emails are actually sent, then register your app again with its HTTPS redirect URI (a confidential client if it has a server). [Configuration](configuration.md) lists every environment variable.

## Next steps

- [Social sign-in](social-sign-in.md): Google, GitHub, Apple and more, turned on from the admin console.
- [Enterprise SSO](enterprise-sso.md): let a customer's Okta or Entra ID sign their people in.
- [Import users](import-users.md): bring your users over from Auth0 or a CSV file.
- [Security](security.md): what to review before going live.
