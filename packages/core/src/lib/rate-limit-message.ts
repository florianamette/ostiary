/** Error code of a request refused by the rate limiter (body of the 429, see withRetryAfter). */
export const RATE_LIMITED_CODE = "RATE_LIMITED";

/** Translator for the `rateLimit` messages: `useTranslations("rateLimit")`. */
type RateLimitTranslator = {
    (key: "seconds", values: { seconds: number }): string;
    (key: "minutes", values: { minutes: number }): string;
    (key: "later"): string;
};

/** Error shape returned by the Better Auth client (`{ error }` or `ctx.error`). */
type ClientError = { status?: number; code?: string; retryAfter?: unknown } | null | undefined;

/** Seconds to wait from a rate-limited response, or null when the error is something else. */
export function retryAfterSeconds(error: ClientError): number | null {
    if (error?.status !== 429) return null;
    const seconds = Number(error.retryAfter);
    return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

/**
 * "Too many attempts. Try again in 40 seconds / 5 minutes." for a request refused by the
 * rate limiter, in the user's language. Null for any other error, including other 429s
 * (for example "too many wrong codes"), which the screens word themselves.
 */
export function rateLimitMessage(error: ClientError, t: RateLimitTranslator): string | null {
    if (error?.status !== 429 || error.code !== RATE_LIMITED_CODE) return null;
    const seconds = retryAfterSeconds(error);
    if (seconds === null) return t("later");
    if (seconds < 60) return t("seconds", { seconds });
    return t("minutes", { minutes: Math.ceil(seconds / 60) });
}
