import { describe, expect, it } from "vitest";

import { resourceByIdentifier } from "@ostiary/core/lib/oauth-resource-access";
import { unrestrictedApiScopes } from "@ostiary/core/lib/oauth-scopes";

describe("unrestrictedApiScopes", () => {
  const rows = [
    { identifier: "https://a.example", allowedScopes: null, metadata: { scopes: ["a:read", "shared"] } },
    { identifier: "https://b.example", allowedScopes: null, metadata: { scopes: ["b:read", "shared"] } },
    { identifier: "https://r.example", allowedScopes: ["openid", "r:read"], metadata: { scopes: ["r:read"] } },
    { identifier: "https://auth.example/api/auth", allowedScopes: null, metadata: null },
  ];

  it("never lets another API's scopes into a token for this one", () => {
    const scopes = unrestrictedApiScopes("https://b.example", rows, ["env:write"]);
    expect(scopes).toEqual(expect.arrayContaining(["openid", "profile", "email", "offline_access", "b:read", "shared", "env:write"]));
    expect(scopes).not.toContain("a:read");
    expect(scopes).not.toContain("r:read");
  });

  it("keeps a scope two APIs declare for both", () => {
    expect(unrestrictedApiScopes("https://a.example", rows, [])).toContain("shared");
  });

  it("gives the auth server and unknown APIs only unowned scopes", () => {
    expect(unrestrictedApiScopes("https://auth.example/api/auth", rows, ["env:write", "a:read"]).sort()).toEqual(
      ["email", "env:write", "offline_access", "openid", "profile"],
    );
  });
});

describe("resourceByIdentifier", () => {
  it("matches Better Auth's lookup of one API by identifier", () => {
    expect(resourceByIdentifier({ model: "oauthResource", where: [{ field: "identifier", value: "https://a.example" }] } as never)).toBe("https://a.example");
  });

  it("ignores other lookups", () => {
    expect(resourceByIdentifier({ model: "oauthClient", where: [{ field: "identifier", value: "x" }] } as never)).toBeNull();
    expect(resourceByIdentifier({ model: "oauthResource", where: [{ field: "id", value: "x" }] } as never)).toBeNull();
    expect(resourceByIdentifier({ model: "oauthResource", where: [{ field: "identifier", operator: "in", value: ["x"] }] } as never)).toBeNull();
  });
});
