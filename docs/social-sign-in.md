# Social sign-in

Let people sign in with Google, GitHub, Apple, Microsoft and 30+ other providers. You turn each one on from the admin console, without a redeploy.

Every social provider Better Auth ships is available under **Sign-in providers** in the admin console. Secrets are stored encrypted and never shown again.

## Turn on a provider

1. In the admin console, open **Sign-in providers** and pick the provider in the **Providers** list.
2. Copy its **Callback URL**: `https://auth.example.com/api/auth/callback/<id>` (`<id>` is in the table below).
3. Choose **Create the app** to open the provider's developer console, create an OAuth app there and register the callback URL (also called redirect URI or return URL).
4. Paste the credentials into the form.
5. Leave **Show on the sign-in page** on and save.

The provider appears on the sign-in and sign-up pages and under **Connected accounts** in each user's dashboard. A change applies at once on the server that made it and within 30 seconds on the others.

## Choose the provider's settings

| Setting | What it does |
| --- | --- |
| **Show on the sign-in page** | Off: the button disappears and sign-ins and callbacks with this provider are refused. Settings are kept |
| **Create accounts for new users** | Off: only people who already have an account can sign in with it (connected from their dashboard, or with the same verified email). The list shows such providers as **Existing accounts only** |
| **Button name** | Shown as "Continue with …" on the sign-in page. Defaults to the provider's name |
| Order | **On the sign-in page** lists the providers that are on; move them up or down to set the order of the buttons |
| **Remove settings** | Deletes the settings and secrets |

Secrets can be replaced, never read back. They are encrypted with a key derived from `BETTER_AUTH_SECRET`: if that secret changes, the stored ones can no longer be decrypted and the console asks for them again.

## Supported providers

| Provider | Id | Fields (besides the client ID and secret, unless stated) |
| --- | --- | --- |
| Apple | `apple` | Services ID, Team ID, Key ID and the `.p8` private key (the client secret JWT is generated and renewed for you); optional app bundle ID for native iOS. Needs HTTPS on a real domain (no localhost) |
| Atlassian | `atlassian` | - |
| Cloudflare | `cloudflare` | Client secret optional (PKCE public client) |
| Amazon Cognito | `cognito` | Cognito domain, region, user pool ID; client secret optional |
| Discord | `discord` | - |
| Dropbox | `dropbox` | App key and secret |
| Facebook | `facebook` | App ID and secret |
| Figma | `figma` | - |
| GitHub | `github` | Or `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`. A GitHub App (not an OAuth App) also needs the account permission **Email addresses** set to Read-only |
| GitLab | `gitlab` | Optional GitLab URL (self-managed) |
| Google | `google` | Optional Workspace domain (`hd`) to accept only that domain |
| Hugging Face | `huggingface` | - |
| Kakao | `kakao` | REST API key; client secret optional |
| Kick | `kick` | - |
| LINE | `line` | Channel ID and secret |
| Linear | `linear` | - |
| LinkedIn | `linkedin` | - |
| Microsoft (Entra ID) | `microsoft` | Optional tenant: `common` (default), `organizations`, `consumers` or a tenant ID |
| Naver | `naver` | - |
| Notion | `notion` | - |
| Paybin | `paybin` | Optional issuer |
| PayPal | `paypal` | Environment: `live` or `sandbox`. Turn on "Log in with PayPal" and ask for the email address |
| Polar | `polar` | - |
| Railway | `railway` | - |
| Reddit | `reddit` | - |
| Roblox | `roblox` | - |
| Salesforce | `salesforce` | Environment (`production` or `sandbox`), optional My Domain host |
| Slack | `slack` | - |
| Spotify | `spotify` | - |
| TikTok | `tiktok` | Client key instead of a client ID |
| Twitch | `twitch` | - |
| X (Twitter) | `twitter` | OAuth 2.0 client ID and secret (not the API key); ask for email access in the app's settings |
| Vercel | `vercel` | - |
| VK | `vk` | App ID and protected key |
| WeChat | `wechat` | AppID and AppSecret (website app; no email) |
| Zoom | `zoom` | - |

Apple returns to the callback URL with a form POST from `https://appleid.apple.com`, which Ostiary trusts for that purpose.

## Set up GitHub from environment variables

`GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` turn on GitHub without the console. A provider set in the environment takes precedence: the console shows it as **Set by environment variables**, read-only. Remove the variables to manage it from the console instead. See [Configuration](configuration.md).

## How the buttons are laid out

- Up to three providers: a full-width **Continue with …** button for each.
- From four: a grid of buttons with names.
- When the grid holds more than six: logos only, with the name as a tooltip.

The provider this browser used last keeps its full-width button and a **Last used** badge.

## How accounts are linked

When someone signs in with a provider and an account already uses the same email, the two are linked only when:

- the provider reports the email as verified, and
- the existing account's email is verified, and
- the existing account is not a platform admin and has no two-factor authentication.

Otherwise the sign-in is refused with "That account isn't connected to a … account yet. Sign in another way, then connect it from your security settings." The person signs in another way and connects the provider from their dashboard.

A new person gets an account (unless **Create accounts for new users** is off) and joins the Public workspace. An account with two-factor authentication still stops at the code step after a social sign-in. `ADMIN_EMAILS` promotes a social sign-up only when the provider reports the address as verified.

Errors the sign-in page shows after a failed social sign-in:

| `?error=` | Message |
| --- | --- |
| `account_not_linked` | That account isn't connected to an account yet (see above) |
| `email_not_found` | The provider didn't share an email address |
| `signup_disabled` | No account for that address, and this provider can't create one |
| anything else | "Could not sign in with that account." |

## Connect and disconnect providers

In the dashboard, **Security**, **Connected accounts**:

- **Connect** adds a provider as a way to sign in, even if it uses another email address. It needs a sign-in from the last 10 minutes, and is refused while an admin is impersonating the account.
- **Disconnect** removes it. The last way to sign in can't be disconnected: add a password or a passkey first.

## Google One Tap

Google's own prompt ("Sign in as …", the browser's FedCM dialog in Chrome) for people already signed in to Google in their browser.

### Turn on One Tap

1. In **Sign-in providers**, open Google (it must be on).
2. Turn on **Show Google One Tap** and save. One Tap uses Google's client ID, Workspace domain (`hd`) and **Create accounts for new users** setting.
3. In the Google Cloud console, add the auth app's origin (e.g. `https://auth.example.com`, and `http://localhost:3000` for local tests) to the OAuth client's **Authorized JavaScript origins**. Without it Google refuses the prompt: the redirect URI alone is not enough.

A real test needs that client and a browser signed in to Google: with any other client ID the script loads but no account is offered.

### Where it shows

The sign-in and sign-up pages only, never consent, account or admin pages. It is not shown when someone is already signed in (or adding another account), nor when this device last signed in another way (password, passkey, code, another provider): those people get the method they use. Dismissed, blocked or unsupported, it does not appear.

### What happens on sign-in

Better Auth's `oneTap` plugin checks the ID token (Google's signature, issuer, audience = your client ID, at most an hour old, and `hd` when set) at `POST /api/auth/one-tap/callback`, then signs in exactly like **Continue with Google**: same account linking, same two-factor step, last-used method (Google), sign-in history, and a pending authorization for an app resumes. The endpoint answers 404 while One Tap is off.

### Content Security Policy

The sign-in and sign-up pages also allow `https://accounts.google.com/gsi/client` (script), `/gsi/style` (style), and `/gsi/` (frames and requests). Other pages keep the stricter policy.

## Related

- [Sign-in methods](sign-in-methods.md): passwords, codes, passkeys and two-factor authentication
- [Enterprise SSO](enterprise-sso.md): an organization's own identity provider (OIDC or SAML)
- [Security](security.md): rate limits and account linking rules
