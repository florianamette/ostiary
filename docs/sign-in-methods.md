# Sign-in methods

How people sign in to Ostiary (password, username, email codes, passkeys, two-factor, captcha) and manage their account from the dashboard.

All of these methods are on by default and need no configuration, except captcha and sending email. Social providers and enterprise SSO have their own guides: [Social sign-in](social-sign-in.md) and [Enterprise SSO](enterprise-sso.md).

| Method | Where | Notes |
| --- | --- | --- |
| Email and password | Sign-in page | Email must be verified first |
| Username and password | Sign-in page, same field as the email | Username chosen at sign-up or in the dashboard |
| Emailed sign-in code | **Email me a sign-in code** | Existing accounts only |
| Passkey | **Sign in with passkey**, or the browser's autofill | Counts as two factors |
| Social providers | **Continue with …** buttons | See [Social sign-in](social-sign-in.md) |
| Enterprise SSO | **Sign in with SSO** | See [Enterprise SSO](enterprise-sso.md) |
| Two-factor authentication | After any of the above except passkeys | Authenticator app (TOTP) or backup code |

The sign-in page is `https://auth.example.com/login` (with a locale prefix, e.g. `/en/login`). Apps reach it through the OIDC authorization endpoint; see [Connect an app](connect-an-app.md).

## Sign up with email and password

The sign-up page (`/signup`) asks for **Full Name**, **Username**, **Email**, **Password** and **Confirm Password**.

1. The person fills in the form and chooses **Create Account**.
2. Ostiary sends a verification link to the address. The person is not signed in yet.
3. Opening the link verifies the address and signs them in (two-factor authentication, if they later turn it on, applies here too).

Rules the server enforces:

- **Password**: 8 to 128 characters. Passwords found in known data breaches (checked with Have I Been Pwned, without sending the password) are refused at sign-up, password change and password reset.
- **Username**: 3 to 30 characters, letters, digits, `_` and `.` only, unique. The form checks availability while you type.
- **Verification link**: valid for 1 hour.
- **One account per inbox** (optional): with `EMAIL_DEDUP`, an address that reaches an existing account's inbox (`john.doe+x@gmail.com` and `johndoe@gmail.com`) is refused like a taken address. See [Configuration](configuration.md).
- **First admin**: an address listed in `ADMIN_EMAILS` gets the admin role once it is verified. See [Quickstart](quickstart.md).

New passwords are hashed with scrypt (Better Auth's default).

## Sign in with a password or a username

The sign-in page has one **Email or username** field. A value with `@` signs in by email, anything else by username. Both use the same password.

If the email is not verified yet, the sign-in is refused, Ostiary sends a new verification link, and the page shows "Please verify your email first" with a form to ask for another link.

The page also remembers the method this browser used last and marks it **Last used** (for example, "You last signed in with a passkey.").

## Reset a forgotten password

1. On the sign-in page, choose **Forgot password?**.
2. Enter the account's email address (also for people who sign in with a username) and choose **Send reset link**. The page answers the same whether or not the account exists.
3. Open the link (valid for 1 hour), enter the new password twice and choose **Update password**.

A reset signs the account out everywhere and revokes its apps' OAuth access and refresh tokens, since whoever knew the old password may hold them. JWT access tokens already issued stay valid until they expire.

An account without a password (passkey, social or SSO only) can use the same flow to add one.

## Sign in with an emailed code

**Email me a sign-in code** replaces the form with an email field. Ostiary emails a 6-digit code; the person reads it on any device and types it in the same tab, so an app's sign-in carries on there.

| | |
| --- | --- |
| Length | 6 digits |
| Valid for | 10 minutes |
| Wrong attempts | 3, then the code is void |
| Requests | 3 per minute per IP |
| Storage | Hashed, like a password |

Codes only sign in to existing accounts. An unknown address gets the same answer and no email; creating an account takes the sign-up page.

A code proves the inbox. On an account whose email was never verified, the first code verifies it and, before signing in, removes the unproven password and sessions.

## Sign in with a passkey

A passkey is a WebAuthn credential stored on the device, in a password manager or on a security key.

**Add a passkey**

1. Open the dashboard, **Security**, **Passkeys**.
2. Choose **Add passkey (this device)** for the device's own authenticator, or **Add passkey (security key)** for a USB or NFC key.
3. Follow the browser's prompt. You can rename or remove passkeys from the same list.

Adding a passkey needs a sign-in from the last 10 minutes (counted from when the session was created), and is refused while an admin is impersonating the account.

**Sign in**: choose **Sign in with passkey**, or pick the passkey from the browser's autofill suggestions in the **Email or username** field.

A passkey sign-in skips the two-factor step: the passkey is already two factors (the device and its unlock).

> [!WARNING]
> Passkeys are bound to the auth app's hostname (the WebAuthn relying party ID is the host of `BETTER_AUTH_URL`). If you move the auth app to another domain, existing passkeys stop working there and users need to add new ones.

## Turn on two-factor authentication

Two-factor authentication adds a code from an authenticator app (TOTP) to every sign-in except passkeys: passwords, emailed codes, social providers (Google One Tap included), SSO and the email verification link.

1. Open the dashboard, **Security**, **Two-factor authentication**, and choose **Turn on**.
2. Enter your password. Accounts without a password (passkey or social only) skip this step.
3. Scan the QR code with an authenticator app (1Password, Google Authenticator, Microsoft Authenticator...). If you can't scan it, copy the key or use **Open in authenticator app**.
4. Enter the 6-digit code and choose **Verify and turn on**.
5. Save the 10 backup codes (**Copy** or **Download**). Each one works once, and they are not shown again.

From the same section, **New backup codes** replaces them and **Turn off** removes two-factor authentication. Both ask for the password, or a recent sign-in on accounts without one.

TOTP secrets and backup codes are stored encrypted.

### Sign in with two-factor authentication

After the first step, the person lands on `/two-factor`:

- **Code** from the authenticator app, or **Use a backup code**.
- **Trust this device for 30 days**: this browser skips the code for 30 days, whatever the sign-in method.
- The pending sign-in lasts 10 minutes. After too many wrong codes it ends and the person signs in again.
- After 10 wrong codes in a row, the account's two-factor step locks for 15 minutes ("Too many wrong codes. Try again in 15 minutes.").

When an app started the sign-in, the authorization request continues after the code.

### Reset someone's two-factor authentication

A person who lost their authenticator and backup codes cannot recover it alone. A platform admin opens **Users**, the user's page, and chooses **Reset** next to two-factor. Their authenticator, backup codes and trusted devices stop working, and they sign in with their first factor alone until they set it up again. Confirm who is asking first: the reset is in the audit log.

### Admins must use two-factor authentication

With `REQUIRE_ADMIN_2FA` (on by default), an admin without two-factor authentication is sent to the dashboard to set it up and cannot use the admin console or the admin endpoints until then (`TWO_FACTOR_REQUIRED`). Their own account keeps working. See [Configuration](configuration.md).

## Add a captcha

A captcha is optional. When on, it protects every endpoint that checks a password, creates an account or sends an email to a typed address:

- sign-up (`/sign-up/email`)
- password sign-in (`/sign-in/email`, `/sign-in/username`)
- password reset request (`/request-password-reset`)
- sign-in code request (`/email-otp/send-verification-otp`)

Supported providers:

| `CAPTCHA_PROVIDER` | Widget |
| --- | --- |
| `cloudflare-turnstile` | Cloudflare Turnstile |
| `hcaptcha` | hCaptcha |
| `google-recaptcha` | reCAPTCHA v2 ("I'm not a robot" checkbox) |

1. Create a site with the provider for the auth app's hostname, and note the site key and secret key.
2. Set all three variables on the auth app:

   ```bash
   CAPTCHA_PROVIDER=cloudflare-turnstile
   CAPTCHA_SITE_KEY=0x4AAAAAAA...
   CAPTCHA_SECRET_KEY=0x4AAAAAAA...
   ```

3. Rebuild and redeploy. The build's security headers include the provider's sources, and the app refuses to start with only some of the three set.

Turnstile and reCAPTCHA tokens are accepted only when solved on the host of the auth app, so a token solved on another site with the same public site key is refused. hCaptcha tokens are checked against your site key. The provider's script, frame and request origins are added to the Content Security Policy of the sign-in pages.

If the widget can't load (a content blocker, for example), the page says "The security check could not load".

## Use several accounts in one browser

A browser can be signed in to up to 5 accounts at once. Each account has its own signed cookie, scoped like the session cookie.

From the dashboard's account menu:

- **Switch to** another signed-in account.
- **Add another account** opens the sign-in page with `addAccount=1`: the accounts already signed in stay signed in.
- **Sign out of** one account, or **Sign out of all accounts**.

The account menu does not offer this while an admin is impersonating the account.

## Let the user pick an account (prompt=select_account)

An app can ask the user to choose which account to continue with, for example a native app signing in through the system browser, whose session may belong to someone else. Send `prompt=select_account` in the authorization request:

```text
https://auth.example.com/api/auth/oauth2/authorize?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback&scope=openid%20profile%20email&code_challenge=...&code_challenge_method=S256&state=...&prompt=select_account
```

Ostiary shows **Choose an account** with each signed-in account (**Continue as …**) and **Use another account**. Picking one continues the authorization with it; with nobody signed in, the normal sign-in page continues it. Without `prompt=select_account`, Ostiary never shows this page and continues with the active account.

## Manage your account from the dashboard

Every user has a dashboard at `https://auth.example.com/dashboard`. Signing in without an app lands there. Its sections:

| Section | What it does |
| --- | --- |
| **Overview** | Account summary. Admins who still need two-factor authentication see a prompt here |
| **Profile** | **Display name**, **Username**, **Email** (verification status, **Resend verification email**, **Change**) |
| **Organizations** | Organizations you belong to, the active one, invitations (owners and admins). Shown only when you belong to one besides the default workspace. See [Organizations](organizations.md) |
| **Security** | **Password**, **Two-factor authentication**, **Passkeys**, **Connected accounts** (social providers), **Active sessions** |
| **Connected apps** | Apps you authorized, their permissions, when connected and last used; **Disconnect** |
| **API keys** | Personal keys for your APIs, when API keys are on. See [API keys](api-keys.md) |
| **Your data** | Download your data, delete your account. See [Your data](account-data.md) |

### Change your email address

1. In **Profile**, choose **Change** next to the email, enter the new address and choose **Send confirmation**.
2. Ostiary emails the current address to approve the change.
3. After approval, Ostiary sends a verification link to the new address. The email changes once it is verified.

Only a verified address can be changed, so a stolen session alone cannot move an account to another inbox. An address an admin sets from the console is unverified until the person verifies it.

### Change your password and review sessions

- **Password**: enter the current and new password and choose **Update password**. Check **Sign out my other devices when the password changes** if someone else may know the old one.
- **Active sessions**: each session's device, IP address, start and expiry. **Revoke** ends one; **Sign out other sessions** ends all but this one.

### Connect a social account

**Connected accounts** lists the providers turned on in the admin console. **Connect** adds one as a way to sign in, even with a different email (it needs a sign-in from the last 10 minutes). **Disconnect** is refused when it is the account's only way to sign in. See [Social sign-in](social-sign-in.md#connect-and-disconnect-providers).

## Related

- [Social sign-in](social-sign-in.md): Google, GitHub, Apple, Microsoft and 30+ providers
- [Enterprise SSO](enterprise-sso.md): OIDC and SAML 2.0 per organization
- [Organizations](organizations.md): members, roles and invitations
- [Security](security.md): rate limits on these endpoints and other protections
- [Configuration](configuration.md): `CAPTCHA_*`, `EMAIL_DEDUP`, `REQUIRE_ADMIN_2FA`, `ADMIN_EMAILS`
