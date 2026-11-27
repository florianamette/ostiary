import { describe, expect, it } from "vitest";

import { describeUserAgent } from "@ostiary/core/lib/security/user-agent";

describe("describeUserAgent", () => {
    it.each([
        [
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            { browser: "Chrome", system: "macOS" },
        ],
        [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
            { browser: "Edge", system: "Windows" },
        ],
        [
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
            { browser: "Safari", system: "iOS" },
        ],
        [
            "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
            { browser: "Chrome", system: "Android" },
        ],
        ["Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0", { browser: "Firefox", system: "Linux" }],
        ["curl/8.5.0", { browser: null, system: null }],
        [null, { browser: null, system: null }],
    ])("%s", (ua, expected) => {
        expect(describeUserAgent(ua)).toEqual(expected);
    });
});
