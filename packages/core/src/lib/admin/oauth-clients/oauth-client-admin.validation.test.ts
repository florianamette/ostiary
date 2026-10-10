import { describe, expect, it } from "vitest";

import { DEVICE_CODE_GRANT_TYPE } from "@ostiary/core/lib/admin/oauth-clients/oauth-client-admin.types";
import {
  createOAuthClientBodySchema,
  INVALID_LOGO_URI_MESSAGE,
  parseCreateOAuthClientBody,
  parseLogoUri,
  parseUpdateOAuthClientBody,
  withDeviceCodeGrant,
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

  it("accepts the device code grant next to the browser grants", () => {
    const r = parseCreateOAuthClientBody({
      redirect_uris: ["http://127.0.0.1/callback"],
      token_endpoint_auth_method: "none",
      type: "native",
      grant_types: ["authorization_code", "refresh_token", DEVICE_CODE_GRANT_TYPE],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.grant_types).toContain(DEVICE_CODE_GRANT_TYPE);
      expect(r.value.response_types).toEqual(["code"]);
    }
  });

  it("rejects unknown grant types", () => {
    const r = parseCreateOAuthClientBody({
      redirect_uris: ["https://x/cb"],
      grant_types: ["urn:ietf:params:oauth:grant-type:jwt-bearer"],
    });
    expect(r.ok).toBe(false);
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

  it("accepts device_code on its own", () => {
    const r = parseUpdateOAuthClientBody({ device_code: true });
    expect(r.ok && r.value).toEqual({ device_code: true });
  });

  it("rejects a non-boolean device_code", () => {
    expect(parseUpdateOAuthClientBody({ device_code: "yes" }).ok).toBe(false);
  });

  it("maps empty client_name to undefined", () => {
    const r = parseUpdateOAuthClientBody({ client_name: "   " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.client_name).toBeUndefined();
    }
  });
});

describe("logo_uri", () => {
  const rejected = [
    "http://cdn.example.com/icon.png",
    "https://localhost/icon.png",
    "https://127.0.0.1/icon.png",
    "https://10.0.0.8/icon.png",
    "https://cdn.example.com:8443/icon.png",
    "https://user:secret@cdn.example.com/icon.png",
    `https://cdn.example.com/${"a".repeat(2048)}`,
  ];

  it("accepts an https URL on a public host when creating", () => {
    const r = parseCreateOAuthClientBody({ redirect_uris: ["http://127.0.0.1:8080/cb"], logo_uri: " https://cdn.example.com/icon.png " });
    expect(r.ok && r.value.logo_uri).toBe("https://cdn.example.com/icon.png");
  });

  it("creates without an icon when empty", () => {
    for (const logo_uri of ["", null, undefined]) {
      const r = parseCreateOAuthClientBody({ redirect_uris: ["https://x/cb"], logo_uri });
      expect(r.ok && r.value.logo_uri).toBeUndefined();
    }
  });

  it("rejects URLs the icon lookup cannot fetch", () => {
    for (const logo_uri of rejected) {
      const created = parseCreateOAuthClientBody({ redirect_uris: ["https://x/cb"], logo_uri });
      expect(created).toEqual({ ok: false, error: `logo_uri: ${INVALID_LOGO_URI_MESSAGE}` });
      expect(parseUpdateOAuthClientBody({ logo_uri }).ok).toBe(false);
    }
  });

  it("sets or clears the icon on update, on its own", () => {
    expect(parseUpdateOAuthClientBody({ logo_uri: "https://cdn.example.com/icon.png" })).toEqual({
      ok: true,
      value: { logo_uri: "https://cdn.example.com/icon.png" },
    });
    expect(parseUpdateOAuthClientBody({ logo_uri: "" })).toEqual({ ok: true, value: { logo_uri: null } });
    expect(parseUpdateOAuthClientBody({ logo_uri: null })).toEqual({ ok: true, value: { logo_uri: null } });
  });

  it("parses an icon set outside the JSON API", () => {
    expect(parseLogoUri("https://cdn.example.com/icon.png")).toEqual({ ok: true, value: "https://cdn.example.com/icon.png" });
    expect(parseLogoUri("  ")).toEqual({ ok: true, value: null });
    expect(parseLogoUri("http://localhost:3000/icon.png").ok).toBe(false);
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

describe("withDeviceCodeGrant", () => {
  it("adds the grant once and keeps the others", () => {
    const grants = ["authorization_code", "refresh_token"];
    expect(withDeviceCodeGrant(grants, true)).toEqual([...grants, DEVICE_CODE_GRANT_TYPE]);
    expect(withDeviceCodeGrant([...grants, DEVICE_CODE_GRANT_TYPE], true)).toEqual([
      ...grants,
      DEVICE_CODE_GRANT_TYPE,
    ]);
  });

  it("removes only the device code grant", () => {
    expect(
      withDeviceCodeGrant(["client_credentials", DEVICE_CODE_GRANT_TYPE], false),
    ).toEqual(["client_credentials"]);
  });

  it("starts from Better Auth's default when no grants are stored", () => {
    expect(withDeviceCodeGrant(null, true)).toEqual(["authorization_code", DEVICE_CODE_GRANT_TYPE]);
    expect(withDeviceCodeGrant([], false)).toEqual(["authorization_code"]);
  });
});
