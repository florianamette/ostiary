/**
 * The captcha providers Ostiary can show, and what each one needs from the browser. No
 * imports: the auth app's next.config reads this file to build its CSP.
 *
 * Better Auth 1.7 also verifies CaptchaFox and Vercel BotID; their widgets are not wired
 * into the sign-in screens, so they are not offered here.
 */
export const CAPTCHA_PROVIDERS = ["cloudflare-turnstile", "hcaptcha", "google-recaptcha"] as const;
export type CaptchaProvider = (typeof CAPTCHA_PROVIDERS)[number];

/** What a sign-in screen needs to render the widget. Both values are public. */
export type CaptchaConfig = { provider: CaptchaProvider; siteKey: string };

export function isCaptchaProvider(value: unknown): value is CaptchaProvider {
  return typeof value === "string" && (CAPTCHA_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Auth endpoints that need a solved captcha (Better Auth paths, without `/api/auth`): every
 * endpoint that checks a password, creates an account or sends an email to a typed address.
 */
export const CAPTCHA_PROTECTED_PATHS = [
  "/sign-up/email",
  "/sign-in/email",
  "/sign-in/username",
  "/request-password-reset",
  "/email-otp/send-verification-otp",
];

/** Header Better Auth's captcha plugin reads the widget's token from. */
export const CAPTCHA_RESPONSE_HEADER = "x-captcha-response";

type CaptchaWidget = {
  /** Script with explicit rendering; `{onload}` is replaced by a global callback name. */
  script: (onload: string, lang: string) => string;
  /** Name of the global the script defines. */
  global: "turnstile" | "hcaptcha" | "grecaptcha";
  /** Extra CSP sources, from each provider's documentation. */
  csp: { script: string[]; frame: string[]; style?: string[]; connect?: string[] };
};

export const CAPTCHA_WIDGETS: Record<CaptchaProvider, CaptchaWidget> = {
  // https://developers.cloudflare.com/turnstile/reference/content-security-policy/
  "cloudflare-turnstile": {
    // Turnstile follows the browser's language by itself.
    script: (onload) => `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=${onload}`,
    global: "turnstile",
    csp: { script: ["https://challenges.cloudflare.com"], frame: ["https://challenges.cloudflare.com"] },
  },
  // https://docs.hcaptcha.com/#content-security-policy-settings
  hcaptcha: {
    script: (onload, lang) => `https://js.hcaptcha.com/1/api.js?render=explicit&onload=${onload}&hl=${lang}`,
    global: "hcaptcha",
    csp: {
      script: ["https://hcaptcha.com", "https://*.hcaptcha.com"],
      frame: ["https://hcaptcha.com", "https://*.hcaptcha.com"],
      style: ["https://hcaptcha.com", "https://*.hcaptcha.com"],
      connect: ["https://hcaptcha.com", "https://*.hcaptcha.com"],
    },
  },
  // reCAPTCHA v2 ("I'm not a robot" checkbox). https://developers.google.com/recaptcha/docs/faq#im-using-content-security-policy-csp-on-my-website.-how-can-i-configure-it-to-work-with-recaptcha
  "google-recaptcha": {
    script: (onload, lang) => `https://www.google.com/recaptcha/api.js?render=explicit&onload=${onload}&hl=${lang}`,
    global: "grecaptcha",
    csp: {
      script: ["https://www.google.com/recaptcha/", "https://www.gstatic.com/recaptcha/"],
      frame: ["https://www.google.com/recaptcha/", "https://recaptcha.google.com/recaptcha/"],
    },
  },
};

/** CSP sources to add for the configured provider (all empty when captcha is off). */
export function captchaCspSources(provider: string | undefined): Required<CaptchaWidget["csp"]> {
  const csp = isCaptchaProvider(provider) ? CAPTCHA_WIDGETS[provider].csp : undefined;
  return {
    script: csp?.script ?? [],
    frame: csp?.frame ?? [],
    style: csp?.style ?? [],
    connect: csp?.connect ?? [],
  };
}
