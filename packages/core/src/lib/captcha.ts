import { env } from "@ostiary/core/lib/env";
import { CAPTCHA_PROTECTED_PATHS, type CaptchaConfig } from "@ostiary/core/lib/captcha-providers";

/**
 * Server only: the captcha the sign-in screens show, or null when it is off. It is on only
 * when CAPTCHA_PROVIDER, CAPTCHA_SITE_KEY and CAPTCHA_SECRET_KEY are all set (env.ts
 * refuses to start with only some of them).
 */
export function captchaConfig(): CaptchaConfig | null {
  if (!env.CAPTCHA_PROVIDER || !env.CAPTCHA_SITE_KEY || !env.CAPTCHA_SECRET_KEY) return null;
  return { provider: env.CAPTCHA_PROVIDER, siteKey: env.CAPTCHA_SITE_KEY };
}

/**
 * Server only: options for Better Auth's `captcha` plugin, or null when captcha is off.
 * `authAppURL` is where the widgets are shown (the auth app's sign-in screens).
 */
export function captchaPluginOptions(authAppURL: string) {
  const config = captchaConfig();
  if (!config || !env.CAPTCHA_SECRET_KEY) return null;
  return {
    provider: config.provider,
    secretKey: env.CAPTCHA_SECRET_KEY,
    endpoints: CAPTCHA_PROTECTED_PATHS,
    // hCaptcha checks that the token was issued for this site key.
    ...(config.provider === "hcaptcha" ? { siteKey: config.siteKey } : {}),
    // Turnstile and reCAPTCHA report the page's hostname: refuse a token solved on another site
    // that uses the same (public) site key.
    ...(config.provider === "cloudflare-turnstile" || config.provider === "google-recaptcha"
      ? { allowedHostnames: [new URL(authAppURL).hostname] }
      : {}),
  };
}
