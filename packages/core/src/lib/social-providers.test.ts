import { describe, expect, it } from "vitest";

import { syncProviderOptions } from "@ostiary/core/lib/social-providers";

describe("syncProviderOptions", () => {
    it("gives Better Auth's options the current providers, in place", () => {
        const custom = { clientId: "plugin-provider" };
        const authOptions: { socialProviders?: Record<string, unknown> } = {
            socialProviders: { github: { clientId: "gh" }, google: { clientId: "old" }, "my-idp": custom },
        };
        const before = authOptions.socialProviders;
        const google = { clientId: "new.apps.googleusercontent.com", clientSecret: "s", hd: "example.com" };
        syncProviderOptions(authOptions, { google });
        // Same object: every request's context shares it.
        expect(authOptions.socialProviders).toBe(before);
        // Turned-off built-in providers go; ids Better Auth does not ship stay.
        expect(authOptions.socialProviders).toEqual({ google, "my-idp": custom });
    });

    it("creates the map when the auth options have none", () => {
        const authOptions: { socialProviders?: Record<string, unknown> } = {};
        syncProviderOptions(authOptions, { google: { clientId: "id" } });
        expect(authOptions.socialProviders).toEqual({ google: { clientId: "id" } });
    });

    it("turns 'Create accounts for new users' off for One Tap too", () => {
        const authOptions: { socialProviders?: Record<string, unknown> } = {};
        const google = { clientId: "id", disableImplicitSignUp: true };
        syncProviderOptions(authOptions, { google });
        // One Tap reads `disableSignUp`; the provider's own options are left alone.
        expect(authOptions.socialProviders?.google).toEqual({ clientId: "id", disableImplicitSignUp: true, disableSignUp: true });
        expect(google).toEqual({ clientId: "id", disableImplicitSignUp: true });
    });

    it("removes Google when it is turned off, so One Tap has no client ID", () => {
        const authOptions: { socialProviders?: Record<string, unknown> } = { socialProviders: { google: { clientId: "id" } } };
        syncProviderOptions(authOptions, {});
        expect(authOptions.socialProviders).toEqual({});
    });
});
