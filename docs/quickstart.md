# Quickstart

Run Ostiary on your machine, make yourself an admin, register an app and sign in to it through Ostiary. It takes about ten minutes.

To look around first without installing anything, the [live demo](https://demo.ostiary.dev) has an admin console you can browse (read-only).

## Before you start

You need:

- Node.js 20.9 or later (the Docker images and CI use Node.js 22)
- pnpm 11 (`corepack enable` installs the version pinned in `package.json`)
- A Postgres database: a local one, or a free [Neon](https://neon.tech) database. For a throwaway local one:

  ```bash
  docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:17
  # DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
  ```

No email service is needed: in development, without Resend, Ostiary prints verification links and sign-in codes in the terminal.

## Run Ostiary

1. Clone the repository, install the dependencies and copy the two example environment files:

   ```bash
   git clone https://github.com/florianamette/ostiary.git && cd ostiary
   pnpm install
   cp apps/auth/.env.example apps/auth/.env.local
   cp apps/admin/.env.example apps/admin/.env.local
   ```

2. In **both** `.env.local` files, set the same database and secret:

   ```bash
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
   BETTER_AUTH_SECRET=...   # openssl rand -base64 32 (at least 32 characters)
   ```

   Leave the other values as they are: `AUTH_APP_URL=http://localhost:3000` and `ADMIN_APP_URL=http://localhost:3001` are already set.

3. In `apps/auth/.env.local`, put your email address in `ADMIN_EMAILS`, so your account becomes an admin:

   ```bash
   ADMIN_EMAILS=you@example.com
   ```

4. Create the tables. `pnpm db:migrate` reads `apps/auth/.env.local`, applies the migrations and registers the OAuth resources:

   ```bash
   pnpm db:migrate
   ```

5. Start both apps, each in its own terminal:

   ```bash
   pnpm dev:auth     # sign-in pages, OIDC provider, account dashboard: http://localhost:3000
   pnpm dev:admin    # admin console: http://localhost:3001
   ```

## Make yourself an admin

1. Open http://localhost:3000/signup and create an account with the address you put in `ADMIN_EMAILS`.
2. Ostiary sends a verification email. Without Resend, the terminal running `dev:auth` prints it instead:

   ```
   [email] Resend not configured; verification link for you@example.com: http://localhost:3000/api/auth/verify-email?token=...
   ```

   Open that link. It verifies the address, signs you in, and gives your account the admin role.
3. Open http://localhost:3001. Admins must turn on two-factor authentication before they use the admin console, so it sends you to **Two-factor authentication** on your account dashboard. Click **Turn on**, enter your password, scan the QR code with an authenticator app, enter the 6-digit code, then **Verify and turn on**. Save the backup codes.
4. Click **Go to the admin console**.

> [!NOTE]
> Only addresses in `ADMIN_EMAILS` that are verified get the admin role, and only when the account is created or verified. To make an existing account an admin, use **Users** in the admin console. Set `REQUIRE_ADMIN_2FA=false` in both apps to let admins in without two-factor authentication (not recommended outside development).

## Register your app

The example app below is a Next.js app with [Auth.js](https://authjs.dev) on port 3002. It runs on your machine, so register it as a public client: confidential clients only accept HTTPS redirect URIs on a public host.

1. In the admin console, open **Applications** and click **Register application**.
2. Fill in the form:
   - **Application name**: `My app`. Users see it on the consent screen.
   - **Redirect URIs**: `http://localhost:3002/api/auth/callback/ostiary`
   - **Client type**: **Public (PKCE, no secret)**
3. Click **Create application** and copy the **Client ID**.

[Connect an app](connect-an-app.md#register-the-app) explains the client types and the redirect URI rules.

## Sign in from your app

Ostiary is a standard OpenID Connect provider. An OIDC library needs the issuer, `http://localhost:3000/api/auth`, and the client ID. It finds everything else in the discovery document at `http://localhost:3000/api/auth/.well-known/openid-configuration`.

1. In your Next.js app, install Auth.js (v5 is published as `next-auth@beta`) and generate its own secret:

   ```bash
   npm install next-auth@beta
   npx auth secret   # writes AUTH_SECRET to .env.local
   ```

2. Add the client ID to the app's `.env.local`:

   ```bash
   OSTIARY_CLIENT_ID=...   # the Client ID you copied
   ```

3. Configure Ostiary as an OIDC provider:

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
         // A public client: no secret, and PKCE (Auth.js's default check) instead.
         client: { token_endpoint_auth_method: "none" },
       },
     ],
   });
   ```

   ```ts
   // app/api/auth/[...nextauth]/route.ts
   import { handlers } from "@/auth";

   export const { GET, POST } = handlers;
   ```

4. Add a sign-in button:

   ```tsx
   // app/page.tsx
   import { auth, signIn } from "@/auth";

   export default async function Home() {
     const session = await auth();
     if (session?.user) return <p>Signed in as {session.user.email}</p>;
     return (
       <form
         action={async () => {
           "use server";
           await signIn("ostiary");
         }}
       >
         <button type="submit">Sign in with Ostiary</button>
       </form>
     );
   }
   ```

5. Run the app on port 3002 (`next dev -p 3002`), open http://localhost:3002 and click **Sign in with Ostiary**. You land on Ostiary's sign-in page, approve the consent screen with **Allow**, and come back signed in.

If Ostiary shows an error instead, check that the redirect URI you registered is exactly the one Auth.js sends, `http://localhost:3002/api/auth/callback/ostiary`. [Troubleshooting](troubleshooting.md) lists the common errors.

## Deploy it

- [Deploy on Vercel](deploy-vercel.md): the **Deploy with Vercel** button creates the project and a Neon database, and every build applies the migrations.
- [Self-hosting](self-hosting.md): Docker Compose runs Postgres, both apps and the daily housekeeping job on your own server, behind your reverse proxy.

In production, emails must be sent: set `RESEND_API_KEY` and `RESEND_FROM`. Register your app again with its HTTPS redirect URI, as a confidential client if it has a server. [Configuration](configuration.md) lists every environment variable.

## Next steps

- [Connect an app](connect-an-app.md): confidential clients, other OIDC libraries, device sign-in for CLIs, per-app branding.
- [Protect an API](protect-an-api.md): access tokens for your own APIs, scopes and machine-to-machine tokens.
- [Social sign-in](social-sign-in.md): Google, GitHub, Apple and more, turned on from the admin console.
- [Import users](import-users.md): bring your users over from Auth0 or a CSV file.
- [Security](security.md): what to review before going live.
