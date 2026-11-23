import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CLIENT_MANAGEMENT_HTTP_PATHS } from "@ostiary/core/lib/oauth-client-guard";
import { openApiSchemaEnabled } from "@ostiary/core/lib/openapi";

describe("openApiSchemaEnabled", () => {
    it("is off in production and on elsewhere, unless OPENAPI_SCHEMA_ENABLED says otherwise", () => {
        expect(openApiSchemaEnabled({ NODE_ENV: "production" })).toBe(false);
        expect(openApiSchemaEnabled({ NODE_ENV: "development" })).toBe(true);
        expect(openApiSchemaEnabled({ NODE_ENV: "production", OPENAPI_SCHEMA_ENABLED: "true" })).toBe(true);
        expect(openApiSchemaEnabled({ NODE_ENV: "development", OPENAPI_SCHEMA_ENABLED: "false" })).toBe(false);
    });
});

// The committed schema (scripts/generate-openapi.mts; CI fails when it is out of date).
describe("apps/auth/openapi.json", () => {
    const schema = JSON.parse(readFileSync(new URL("../../../../apps/auth/openapi.json", import.meta.url), "utf8")) as {
        info: { title: string };
        servers: { url: string }[];
        paths: Record<string, unknown>;
    };
    const paths = Object.keys(schema.paths);

    it("lists the OAuth, sign-in and plugin endpoints", () => {
        expect(schema.info.title).toBe("Ostiary auth API");
        expect(schema.servers[0].url).toBe("https://auth.example.com/api/auth");
        for (const path of ["/oauth2/token", "/oauth2/introspect", "/sign-in/email", "/passkey/verify-authentication", "/scim/v2/Users"]) {
            expect(paths).toContain(path);
        }
    });

    it("leaves out the endpoints Ostiary does not serve over HTTP", () => {
        for (const path of [...CLIENT_MANAGEMENT_HTTP_PATHS, "/token", "/reference", "/open-api/generate-schema", "/api-key/create"]) {
            expect(paths).not.toContain(path);
        }
    });
});
