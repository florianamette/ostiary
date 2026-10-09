import { getIP } from "@better-auth/core/utils/ip";
import { describe, expect, it } from "vitest";

import { ipAddressOptions, resolveClientIp } from "@ostiary/core/lib/rate-limit";

// On Vercel unless a test says otherwise (Better Auth's default header handling).
const VERCEL = { VERCEL: "1" };
const ip = (headers: Record<string, string>, env: Parameters<typeof ipAddressOptions>[0] = VERCEL) =>
    resolveClientIp(new Headers(headers), ipAddressOptions(env));

describe("resolveClientIp", () => {
    it("reads a single-address x-forwarded-for (Vercel)", () => {
        expect(ip({ "x-forwarded-for": "203.0.113.7" })).toBe("203.0.113.7");
        expect(ip({ "x-forwarded-for": " 203.0.113.7 " })).toBe("203.0.113.7");
    });

    it("ignores a multi-address x-forwarded-for without TRUSTED_PROXIES, as Better Auth does", () => {
        // The left-most value is whatever the client sent: never trusted.
        expect(ip({ "x-forwarded-for": "198.51.100.1, 203.0.113.7" })).toBeNull();
    });

    it("takes the right-most address that is not a trusted proxy", () => {
        const env = { TRUSTED_PROXIES: "10.0.0.0/8, 192.0.2.1" };
        expect(ip({ "x-forwarded-for": "203.0.113.7, 10.1.2.3" }, env)).toBe("203.0.113.7");
        expect(ip({ "x-forwarded-for": "203.0.113.7, 192.0.2.1, 10.1.2.3" }, env)).toBe("203.0.113.7");
    });

    it("ignores a spoofed left-most value behind trusted proxies", () => {
        const env = { TRUSTED_PROXIES: "10.0.0.0/8" };
        // The client sent "x-forwarded-for: 1.1.1.1"; the proxy appended the real address.
        expect(ip({ "x-forwarded-for": "1.1.1.1, 203.0.113.7, 10.0.0.5" }, env)).toBe("203.0.113.7");
        // A garbage hop to the right of the client stops the walk: nothing is trusted.
        expect(ip({ "x-forwarded-for": "203.0.113.7, not-an-ip, 10.0.0.5" }, env)).toBeNull();
        // Every hop is a proxy: no client address.
        expect(ip({ "x-forwarded-for": "10.0.0.9, 10.0.0.5" }, env)).toBeNull();
    });

    it("reads a custom header such as cf-connecting-ip, and only the configured ones", () => {
        const env = { IP_ADDRESS_HEADERS: "CF-Connecting-IP" };
        expect(ip({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }, env)).toBe("203.0.113.7");
        // x-forwarded-for is no longer read once other headers are configured.
        expect(ip({ "x-forwarded-for": "198.51.100.1" }, env)).toBeNull();
        // Headers are tried in order.
        const both = { IP_ADDRESS_HEADERS: "cf-connecting-ip, x-forwarded-for" };
        expect(ip({ "x-forwarded-for": "198.51.100.1" }, both)).toBe("198.51.100.1");
        // x-real-ip is not read unless configured (it used to be a fallback).
        expect(ip({ "x-real-ip": "198.51.100.1" })).toBeNull();
        expect(ip({ "x-real-ip": "198.51.100.1" }, { IP_ADDRESS_HEADERS: "x-real-ip" })).toBe("198.51.100.1");
    });

    it("keeps IPv6 addresses whole and unmaps IPv4-mapped ones", () => {
        expect(ip({ "x-forwarded-for": "2001:db8::1" })).toBe("2001:0db8:0000:0000:0000:0000:0000:0001");
        expect(ip({ "x-forwarded-for": "2001:DB8:1:2:3:4:5:6" })).toBe("2001:0db8:0001:0002:0003:0004:0005:0006");
        expect(ip({ "x-forwarded-for": "::ffff:203.0.113.7" })).toBe("203.0.113.7");
        expect(ip({ "x-forwarded-for": "2001:db8::1, fd00::2" }, { TRUSTED_PROXIES: "fd00::/8" })).toBe(
            "2001:0db8:0000:0000:0000:0000:0000:0001",
        );
    });

    it("returns null without headers or a usable address", () => {
        expect(resolveClientIp(null, {})).toBeNull();
        expect(resolveClientIp(undefined, {})).toBeNull();
        expect(ip({})).toBeNull();
        expect(ip({ "x-forwarded-for": "" })).toBeNull();
        expect(ip({ "x-forwarded-for": "unknown" })).toBeNull();
        expect(resolveClientIp(new Headers({ "x-forwarded-for": "203.0.113.7" }), { disableIpTracking: true })).toBeNull();
    });
});

describe("client IP off Vercel", () => {
    it("trusts no header unless IP_ADDRESS_HEADERS or TRUSTED_PROXIES is set", () => {
        expect(ipAddressOptions({})).toEqual({ ipAddressHeaders: [] });
        expect(ipAddressOptions({ VERCEL: "" })).toEqual({ ipAddressHeaders: [] });
        // A spoofed single-address x-forwarded-for, the default Better Auth would trust.
        expect(ip({ "x-forwarded-for": "203.0.113.7" }, {})).toBeNull();
        expect(ip({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "198.51.100.1" }, {})).toBeNull();
        // Better Auth reads no header either (and falls back to 127.0.0.1 only outside production).
        const headers = new Headers({ "x-forwarded-for": "203.0.113.7" });
        expect(getIP(headers, { advanced: { ipAddress: ipAddressOptions({}) } })).not.toBe("203.0.113.7");
    });

    it("follows explicit settings", () => {
        expect(ip({ "x-forwarded-for": "203.0.113.7" }, { IP_ADDRESS_HEADERS: "x-forwarded-for" })).toBe("203.0.113.7");
        expect(ip({ "x-forwarded-for": "203.0.113.7, 10.0.0.5" }, { TRUSTED_PROXIES: "10.0.0.0/8" })).toBe("203.0.113.7");
        expect(ip({ "cf-connecting-ip": "203.0.113.7" }, { IP_ADDRESS_HEADERS: "cf-connecting-ip" })).toBe("203.0.113.7");
    });
});

describe("resolveClientIp and Better Auth", () => {
    it("picks the same address Better Auth uses for rate limits and sessions", () => {
        const cases: [Record<string, string>, Parameters<typeof ipAddressOptions>[0]][] = [
            [{ "x-forwarded-for": "203.0.113.7" }, VERCEL],
            [{ "x-forwarded-for": "1.1.1.1, 203.0.113.7, 10.0.0.5" }, { TRUSTED_PROXIES: "10.0.0.0/8" }],
            [{ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }, { IP_ADDRESS_HEADERS: "cf-connecting-ip" }],
            [{ "x-forwarded-for": "::ffff:203.0.113.7" }, VERCEL],
        ];
        for (const [headers, env] of cases) {
            const options = ipAddressOptions(env);
            expect(resolveClientIp(new Headers(headers), options)).toBe(
                getIP(new Headers(headers), { advanced: { ipAddress: options } }),
            );
        }
    });
});
