import { getAuthTables } from "better-auth/db";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { rateLimit } from "@ostiary/core/db/schema/rate-limit";
import {
    ipAddressOptions,
    RATE_LIMIT_RULES,
    rateLimitOptions,
    withRateLimitHeaders,
    withRetryAfter,
} from "@ostiary/core/lib/rate-limit";
import { RATE_LIMITED_CODE, rateLimitMessage, retryAfterSeconds } from "@ostiary/core/lib/rate-limit-message";

describe("rateLimitOptions", () => {
    it("counts in the database and is on in production by default", () => {
        const options = rateLimitOptions({ NODE_ENV: "production" });
        expect(options.enabled).toBe(true);
        expect(options.storage).toBe("database");
        expect(options.customRules).toBe(RATE_LIMIT_RULES);
    });

    it("is off in development unless RATE_LIMIT_ENABLED=true", () => {
        expect(rateLimitOptions({ NODE_ENV: "development" }).enabled).toBe(false);
        expect(rateLimitOptions({ NODE_ENV: "development", RATE_LIMIT_ENABLED: "true" }).enabled).toBe(true);
        expect(rateLimitOptions({ NODE_ENV: "production", RATE_LIMIT_ENABLED: "false" }).enabled).toBe(false);
    });

    it("is stricter than Better Auth's defaults where secrets are guessed", () => {
        // Better Auth: 3 per 10 s on /sign-in/* and /two-factor/* (18 a minute at most).
        for (const path of ["/sign-in/email", "/sign-in/username", "/two-factor/verify-totp", "/two-factor/verify-backup-code"] as const) {
            const rule = RATE_LIMIT_RULES[path];
            expect(rule.max / rule.window, path).toBeLessThan(3 / 10);
        }
    });

    it("leaves the token endpoint room for device polling and refreshes", () => {
        const rule = RATE_LIMIT_RULES["/oauth2/token"];
        // One device polling every 5 seconds is 12 requests a minute.
        expect((rule.max / rule.window) * 60).toBeGreaterThanOrEqual(12 * 20);
    });
});

describe("rate limit table", () => {
    it("has every field of Better Auth's rateLimit model", () => {
        const model = getAuthTables({ rateLimit: { storage: "database" } }).rateLimit;
        expect(model).toBeDefined();
        const columns = getTableColumns(rateLimit);
        for (const field of ["id", ...Object.keys(model!.fields)]) {
            expect(columns, field).toHaveProperty(field);
        }
        expect(columns.key.isUnique).toBe(true);
    });
});

describe("ipAddressOptions", () => {
    it("keeps Better Auth's default (x-forwarded-for, single address) when unset", () => {
        expect(ipAddressOptions({})).toEqual({});
        expect(ipAddressOptions({ IP_ADDRESS_HEADERS: " ", TRUSTED_PROXIES: "" })).toEqual({});
    });

    it("reads comma-separated headers and proxies", () => {
        expect(
            ipAddressOptions({ IP_ADDRESS_HEADERS: "CF-Connecting-IP, x-forwarded-for", TRUSTED_PROXIES: "10.0.0.0/8, 192.0.2.1" }),
        ).toEqual({
            ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
            trustedProxies: ["10.0.0.0/8", "192.0.2.1"],
        });
    });
});

describe("withRetryAfter", () => {
    const limited = () =>
        new Response(JSON.stringify({ message: "Too many requests. Please try again later." }), {
            status: 429,
            headers: { "Content-Type": "application/json", "X-Retry-After": "42" },
        });

    it("adds Retry-After and the wait to a rate-limited response", async () => {
        const response = await withRetryAfter(limited());
        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("42");
        expect(response.headers.get("x-retry-after")).toBe("42");
        expect(await response.json()).toEqual({
            code: RATE_LIMITED_CODE,
            message: "Too many requests. Please try again later.",
            retryAfter: 42,
        });
    });

    it("leaves other responses alone, including 429s from endpoints", async () => {
        const ok = new Response("{}", { status: 200 });
        expect(await withRetryAfter(ok)).toBe(ok);
        const endpoint429 = new Response(JSON.stringify({ code: "TOO_MANY_ATTEMPTS" }), { status: 429 });
        expect(await withRetryAfter(endpoint429)).toBe(endpoint429);
    });

    it("wraps every route handler", async () => {
        const handlers = withRateLimitHeaders({
            GET: async (_request: Request) => limited(),
            POST: async (_request: Request) => new Response("ok"),
        });
        expect((await handlers.GET(new Request("http://localhost/"))).headers.get("retry-after")).toBe("42");
        expect(await (await handlers.POST(new Request("http://localhost/"))).text()).toBe("ok");
    });
});

describe("rateLimitMessage", () => {
    const t = ((key: string, values?: Record<string, number>) => `${key}:${JSON.stringify(values ?? {})}`) as Parameters<
        typeof rateLimitMessage
    >[1];

    it("says how long to wait, in seconds or rounded-up minutes", () => {
        expect(rateLimitMessage({ status: 429, code: RATE_LIMITED_CODE, retryAfter: 9 }, t)).toBe('seconds:{"seconds":9}');
        expect(rateLimitMessage({ status: 429, code: RATE_LIMITED_CODE, retryAfter: 61 }, t)).toBe('minutes:{"minutes":2}');
        expect(rateLimitMessage({ status: 429, code: RATE_LIMITED_CODE }, t)).toBe("later:{}");
    });

    it("ignores other errors", () => {
        expect(rateLimitMessage({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" }, t)).toBeNull();
        expect(rateLimitMessage({ status: 429, code: "TOO_MANY_ATTEMPTS" }, t)).toBeNull();
        expect(rateLimitMessage(null, t)).toBeNull();
    });

    it("reads the wait only from 429s", () => {
        expect(retryAfterSeconds({ status: 429, retryAfter: "30" })).toBe(30);
        expect(retryAfterSeconds({ status: 400, retryAfter: 30 })).toBeNull();
    });
});
