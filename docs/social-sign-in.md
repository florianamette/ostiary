# Social sign-in

Every social provider Better Auth ships can be turned on from the admin console, under **Sign-in providers**, without a redeploy:

1. Open the provider and copy its **callback URL**: `https://auth.example.com/api/auth/callback/<id>`.
2. Create an OAuth app with the provider (**Create the app** links to its console), register the callback URL, and paste the credentials.
3. Leave **Show on the sign-in page** on and save. The sign-in, sign-up and account pages show it within 30 seconds; turning it off removes the button and refuses its sign-ins and callbacks.

Secrets are stored encrypted and never shown again (you can replace them). **Create accounts for new users** off lets the provider sign in existing accounts only. Users connect and disconnect providers from **Connected accounts** in their dashboard (never their last way to sign in). `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` keep working and take precedence over the console. Changing `BETTER_AUTH_SECRET` makes stored provider secrets unreadable: the console then asks for them again.

| Provider | Id | Fields (besides the client ID and secret, unless stated) |
| --- | --- | --- |
| Apple | `apple` | Services ID, Team ID, Key ID and the `.p8` private key (the client secret JWT is generated and renewed for you); optional app bundle ID for native iOS. Needs HTTPS |
| Atlassian | `atlassian` | - |
| Cloudflare | `cloudflare` | Client secret optional (PKCE public client) |
| Amazon Cognito | `cognito` | Cognito domain, region, user pool ID; client secret optional |
| Discord | `discord` | - |
| Dropbox | `dropbox` | App key and secret |
| Facebook | `facebook` | App ID and secret |
| Figma | `figma` | - |
| GitHub | `github` | Or `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` |
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
| PayPal | `paypal` | Environment: `live` or `sandbox` |
| Polar | `polar` | - |
| Railway | `railway` | - |
| Reddit | `reddit` | - |
| Roblox | `roblox` | - |
| Salesforce | `salesforce` | Environment (`production` or `sandbox`), optional My Domain host |
| Slack | `slack` | - |
| Spotify | `spotify` | - |
| TikTok | `tiktok` | Client key instead of a client ID |
| Twitch | `twitch` | - |
| X (Twitter) | `twitter` | OAuth 2.0 client ID and secret |
| Vercel | `vercel` | - |
| VK | `vk` | App ID and protected key |
| WeChat | `wechat` | AppID and AppSecret (website app; no email) |
| Zoom | `zoom` | - |

With a few providers the sign-in page shows a full-width button for each; from four, a grid with names; from seven, a grid of logos with tooltips. The provider used last on that device keeps its full-width button.

## Google One Tap

Google's own prompt ("Sign in as …", the browser's FedCM dialog in Chrome) for people already signed in to Google in their browser. Turn on **Show Google One Tap** in Google's settings under **Sign-in providers**; it works only while Google itself is on, and uses the same client ID, Workspace domain (`hd`) and **Create accounts for new users** setting.

- **Google Cloud console**: add the auth app's origin (e.g. `https://auth.example.com`, and `http://localhost:3000` for local tests) to the OAuth client's **Authorized JavaScript origins**. Without it Google refuses the prompt (the redirect URI alone is not enough). A real test needs that client and a browser signed in to Google: with any other client ID the script loads but no account is offered.
- **Where**: the sign-in and sign-up pages only, never consent, account or admin pages. Not shown when someone is already signed in (or adding another account), nor when this device last signed in another way (password, passkey, code, another provider): those people get the method they use. Dismissed, blocked or unsupported, it simply does not appear.
- **What happens**: Better Auth's `oneTap` plugin checks the ID token (Google's signature, issuer, audience = your client ID, at most an hour old, and `hd` when set) at `POST /api/auth/one-tap/callback`, then signs in exactly like **Continue with Google**: same account linking, last-used method (Google), sign-in history, and a pending authorization for an app resumes. The endpoint answers 404 while One Tap is off.
- **Content Security Policy**: the sign-in and sign-up pages also allow `https://accounts.google.com/gsi/client` (script), `/gsi/style` (style), and `/gsi/` (frames and requests). Other pages keep the stricter policy.
