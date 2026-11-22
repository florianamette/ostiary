import { describe, expect, it } from "vitest";

import {
    OAUTH_TOKEN_PREFIXES,
    addPrefixes,
    prefixedEndpoint,
    withSecretPrefix,
    withTokenPrefixFallback,
} from "@ostiary/core/lib/oauth-token-prefixes";

const CS = OAUTH_TOKEN_PREFIXES.clientSecret;
const RT = OAUTH_TOKEN_PREFIXES.refreshToken;
const basic = (id: string, secret: string) => `Basic ${btoa(`${id}:${secret}`)}`;

describe("prefixedEndpoint", () => {
    it("matches the token, introspection and revocation endpoints only", () => {
        expect(prefixedEndpoint("/api/auth/oauth2/token")).toBe("token");
        expect(prefixedEndpoint("/api/auth/oauth2/introspect")).toBe("introspect");
        expect(prefixedEndpoint("/api/auth/oauth2/revoke")).toBe("revoke");
        expect(prefixedEndpoint("/api/auth/oauth2/userinfo")).toBeNull();
        expect(prefixedEndpoint("/api/auth/oauth2/token/extra")).toBeNull();
    });
});

describe("withSecretPrefix", () => {
    it("prefixes the secret of Basic credentials", () => {
        expect(withSecretPrefix(basic("app", "s3cret"))).toBe(basic("app", `${CS}s3cret`));
    });

    it("leaves a prefixed secret, other schemes and malformed values alone", () => {
        expect(withSecretPrefix(basic("app", `${CS}s3cret`))).toBe(basic("app", `${CS}s3cret`));
        expect(withSecretPrefix("Bearer abc")).toBe("Bearer abc");
        expect(withSecretPrefix("Basic %%%")).toBe("Basic %%%");
        expect(withSecretPrefix(`Basic ${btoa("no-colon")}`)).toBe(`Basic ${btoa("no-colon")}`);
        expect(withSecretPrefix(basic("app", ""))).toBe(basic("app", ""));
        expect(withSecretPrefix(null)).toBeNull();
    });

    it("keeps a form-encoded client ID as it is", () => {
        expect(withSecretPrefix(basic("my%3Aapp", "x"))).toBe(basic("my%3Aapp", `${CS}x`));
    });
});

describe("addPrefixes", () => {
    it("prefixes client_secret and a refresh token on the token endpoint", () => {
        const params = new Map([
            ["grant_type", "refresh_token"],
            ["refresh_token", "old"],
            ["client_secret", "sec"],
        ]);
        expect(addPrefixes("token", params)).toBe(false);
        expect(params.get("refresh_token")).toBe(`${RT}old`);
        expect(params.get("client_secret")).toBe(`${CS}sec`);
    });

    it("leaves an authorization code alone", () => {
        const params = new Map([
            ["grant_type", "authorization_code"],
            ["code", "abc"],
        ]);
        addPrefixes("token", params);
        expect(params.get("code")).toBe("abc");
    });

    it("prefixes a token hinted as a refresh token", () => {
        const params = new Map([
            ["token", "old"],
            ["token_type_hint", "refresh_token"],
        ]);
        expect(addPrefixes("revoke", params)).toBe(false);
        expect(params.get("token")).toBe(`${RT}old`);
    });

    it("asks to try an unhinted opaque token both ways, never a JWT, an access token or a prefixed one", () => {
        expect(addPrefixes("introspect", new Map([["token", "opaque"]]))).toBe(true);
        expect(addPrefixes("introspect", new Map([["token", "a.b.c"]]))).toBe(false);
        expect(
            addPrefixes(
                "introspect",
                new Map([
                    ["token", "opaque"],
                    ["token_type_hint", "access_token"],
                ]),
            ),
        ).toBe(false);
        expect(addPrefixes("introspect", new Map([["token", `${RT}x`]]))).toBe(false);
    });
});

describe("withTokenPrefixFallback", () => {
    type Seen = { auth: string | null; body: string };
    function recorder(responses: Response[]) {
        const seen: Seen[] = [];
        const handler = withTokenPrefixFallback(async (request) => {
            seen.push({ auth: request.headers.get("authorization"), body: await request.text() });
            return responses.shift() ?? new Response("{}", { status: 200 });
        });
        return { seen, handler };
    }
    const form = (url: string, body: string, headers: Record<string, string> = {}) =>
        new Request(`https://auth.test/api/auth/oauth2/${url}`, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
            body,
        });

    it("adds the prefixes to a token request", async () => {
        const { seen, handler } = recorder([]);
        await handler(
            form("token", "grant_type=refresh_token&refresh_token=old", { authorization: basic("app", "sec") }),
        );
        expect(seen).toEqual([
            { auth: basic("app", `${CS}sec`), body: `grant_type=refresh_token&refresh_token=${RT}old` },
        ]);
    });

    it("handles a JSON body", async () => {
        const { seen, handler } = recorder([]);
        await handler(
            new Request("https://auth.test/api/auth/oauth2/token", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ grant_type: "client_credentials", client_id: "app", client_secret: "sec", n: 1 }),
            }),
        );
        expect(JSON.parse(seen[0].body)).toEqual({
            grant_type: "client_credentials",
            client_id: "app",
            client_secret: `${CS}sec`,
            n: 1,
        });
    });

    it("introspects an unhinted token again as a refresh token when it is not found", async () => {
        const { seen, handler } = recorder([Response.json({ active: false }), Response.json({ active: true })]);
        const response = await handler(form("introspect", "token=old"));
        expect(await response.json()).toEqual({ active: true });
        expect(seen.map((s) => s.body)).toEqual(["token=old", `token=${RT}old&token_type_hint=refresh_token`]);
    });

    it("does not ask again when the token is found as sent", async () => {
        const { seen, handler } = recorder([Response.json({ active: true })]);
        await handler(form("introspect", "token=live"));
        expect(seen).toHaveLength(1);
    });

    it("revokes an unhinted token both ways and answers the first response", async () => {
        const { seen, handler } = recorder([new Response(null, { status: 200 }), new Response(null, { status: 200 })]);
        const response = await handler(form("revoke", "token=old"));
        expect(response.status).toBe(200);
        expect(seen.map((s) => s.body)).toEqual(["token=old", `token=${RT}old&token_type_hint=refresh_token`]);
    });

    it("answers the refresh-token revocation when the first one was refused", async () => {
        const { handler } = recorder([Response.json({ error: "invalid_request" }, { status: 400 }), new Response(null, { status: 200 })]);
        const response = await handler(form("revoke", "token=old"));
        expect(response.status).toBe(200);
    });

    it("passes other paths and methods through untouched", async () => {
        const { seen, handler } = recorder([]);
        const request = new Request("https://auth.test/api/auth/oauth2/userinfo", {
            method: "POST",
            headers: { authorization: basic("app", "sec") },
        });
        await handler(request);
        expect(seen[0].auth).toBe(basic("app", "sec"));
    });
});
