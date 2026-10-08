import { describe, expect, it } from "vitest";

import {
  createOAuthClientBodySchema,
  parseCreateOAuthClientBody,
  parseUpdateOAuthClientBody,
} from "@ostiary/core/lib/admin/oauth-clients/oauth-client-admin.validation";

describe("createOAuthClientBodySchema", () => {
  it("accepts minimal valid body with defaults", () => {
    const out = createOAuthClientBodySchema().parse({
      redirect_uris: ["https://a.test/cb"],
    });
    expect(out.token_endpoint_auth_method).toBe("client_secret_basic");
    expect(out.grant_types).toEqual(["authorization_code", "refresh_token"]);
    expect(out.skip_consent).toBe(false);
  });

  it("rejects empty redirect_uris", () => {
    expect(() =>
      createOAuthClientBodySchema().parse({ redirect_uris: [] }),
    ).toThrow();
  });
});

describe("parseCreateOAuthClientBody", () => {
  it("returns ok for valid input", () => {
    const r = parseCreateOAuthClientBody({
      redirect_uris: ["https://x/cb"],
      client_name: "App",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.redirect_uris).toEqual(["https://x/cb"]);
      expect(r.value.client_name).toBe("App");
    }
  });

  it("derives response_types from the grants (Better Auth 1.7 requires them to match)", () => {
    const web = parseCreateOAuthClientBody({ redirect_uris: ["https://x/cb"] });
    expect(web.ok && web.value.response_types).toEqual(["code"]);

    const machine = parseCreateOAuthClientBody({
      redirect_uris: ["https://x/cb"],
      grant_types: ["client_credentials"],
      response_types: ["code"],
      scope: "orders:write",
    });
    expect(machine.ok && machine.value.response_types).toEqual([]);
  });

  it("returns error for non-object", () => {
    const r = parseCreateOAuthClientBody(null);
    expect(r.ok).toBe(false);
  });

  it("accepts a machine client limited to an API scope", () => {
    const r = parseCreateOAuthClientBody({
      redirect_uris: ["https://x/cb"],
      grant_types: ["client_credentials"],
      scope: " orders:write ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.scope).toBe("orders:write");
  });

  it("rejects machine clients without explicit API scopes", () => {
    for (const scope of [undefined, "openid", "orders:write openid"]) {
      const r = parseCreateOAuthClientBody({
        redirect_uris: ["https://x/cb"],
        grant_types: ["client_credentials"],
        ...(scope ? { scope } : {}),
      });
      expect(r.ok, String(scope)).toBe(false);
    }
  });

  it("rejects unknown scopes", () => {
    const r = parseCreateOAuthClientBody({
      redirect_uris: ["https://x/cb"],
      scope: "openid admin:everything",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^scope:/);
  });

  it("leaves user-facing clients without scope unchanged", () => {
    const r = parseCreateOAuthClientBody({ redirect_uris: ["https://x/cb"] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.scope).toBeUndefined();
  });
});

describe("parseUpdateOAuthClientBody", () => {
  it("requires at least one field", () => {
    const r = parseUpdateOAuthClientBody({});
    expect(r.ok).toBe(false);
  });

  it("normalizes client_name trim", () => {
    const r = parseUpdateOAuthClientBody({ client_name: "  hi  " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.client_name).toBe("hi");
    }
  });

  it("maps empty client_name to undefined", () => {
    const r = parseUpdateOAuthClientBody({ client_name: "   " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.client_name).toBeUndefined();
    }
  });
});

describe("API scopes registered at runtime", () => {
  it("accepts a machine client limited to a scope from the database", () => {
    const body = {
      redirect_uris: ["https://x/cb"],
      grant_types: ["client_credentials"],
      scope: "labs:publish",
    };
    expect(parseCreateOAuthClientBody(body).ok).toBe(false);
    expect(parseCreateOAuthClientBody(body, ["labs:publish"]).ok).toBe(true);
  });
});
