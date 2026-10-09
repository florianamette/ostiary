import { describe, expect, it } from "vitest";

import {
  applyClientRegistration,
  clientActionAllowed,
  DEFAULT_CLIENT_REGISTRATION_SETTINGS,
  effectiveRegistrationScopes,
  markDynamicRegistration,
  metadataDocumentHostAllowed,
  normalizeHost,
  parseClientRegistrationSettings,
  registrationRequestError,
  registrationSource,
  requestClientIds,
  selfRegisteredUpdateError,
  type RegistrationProviderOptions,
} from "@ostiary/core/lib/client-registration-policy";

describe("parseClientRegistrationSettings", () => {
  it("is off when nothing is stored", () => {
    expect(parseClientRegistrationSettings(undefined)).toEqual(DEFAULT_CLIENT_REGISTRATION_SETTINGS);
    expect(parseClientRegistrationSettings(null).dynamic).toBe("off");
    expect(parseClientRegistrationSettings("open").metadataDocuments).toBe(false);
  });

  it("falls back to the default for each invalid field", () => {
    const parsed = parseClientRegistrationSettings({
      dynamic: "everyone",
      metadataDocuments: "yes",
      scopes: ["openid", "bad scope", 3, "orders:read", "openid"],
      metadataDocumentHosts: ["HTTPS://Claude.ai/path", "localhost", "not a host", "vscode.dev."],
      maxRegistrationsPerHour: -1,
    });
    expect(parsed).toEqual({
      dynamic: "off",
      metadataDocuments: false,
      scopes: ["openid", "orders:read"],
      metadataDocumentHosts: ["claude.ai", "vscode.dev"],
      maxRegistrationsPerHour: DEFAULT_CLIENT_REGISTRATION_SETTINGS.maxRegistrationsPerHour,
    });
  });

  it("keeps valid values", () => {
    const value = {
      dynamic: "open",
      metadataDocuments: true,
      scopes: ["openid", "email"],
      metadataDocumentHosts: [],
      maxRegistrationsPerHour: 0,
    };
    expect(parseClientRegistrationSettings(value)).toEqual(value);
  });
});

describe("normalizeHost", () => {
  it("accepts DNS names and strips schemes and paths", () => {
    expect(normalizeHost(" Example.COM ")).toBe("example.com");
    expect(normalizeHost("https://app.example.com/oauth/client.json")).toBe("app.example.com");
  });

  it("rejects IPs and single labels", () => {
    expect(normalizeHost("127.0.0.1")).toBeNull();
    expect(normalizeHost("localhost")).toBeNull();
    expect(normalizeHost("")).toBeNull();
  });
});

describe("applyClientRegistration", () => {
  const extension = { clientDiscovery: { id: "cimd" } };
  const other = { grants: {} };

  function options(): RegistrationProviderOptions {
    return { scopes: ["openid", "profile", "email", "offline_access", "orders:read", "admin:all"], extensions: [other] };
  }

  it("turns everything off by default", () => {
    const opts = options();
    applyClientRegistration(opts, DEFAULT_CLIENT_REGISTRATION_SETTINGS, extension);
    expect(opts.allowDynamicClientRegistration).toBe(false);
    expect(opts.allowUnauthenticatedClientRegistration).toBe(false);
    expect(opts.extensions).toEqual([other]);
  });

  it("limits registered clients to the allowed scopes that exist", () => {
    const opts = options();
    applyClientRegistration(
      opts,
      { ...DEFAULT_CLIENT_REGISTRATION_SETTINGS, dynamic: "open", scopes: ["openid", "orders:read", "gone:scope"] },
      extension,
    );
    expect(opts.allowDynamicClientRegistration).toBe(true);
    expect(opts.allowUnauthenticatedClientRegistration).toBe(true);
    // Never left undefined: Better Auth would then allow every server scope (admin:all too).
    expect(opts.clientRegistrationDefaultScopes).toEqual(["openid", "orders:read"]);
    expect(opts.clientRegistrationAllowedScopes).toEqual(["openid", "orders:read"]);
    expect(opts.clientRegistrationRequirePKCE).toBe(true);
  });

  it("requires a session in signed_in mode", () => {
    const opts = options();
    applyClientRegistration(opts, { ...DEFAULT_CLIENT_REGISTRATION_SETTINGS, dynamic: "signed_in" }, extension);
    expect(opts.allowDynamicClientRegistration).toBe(true);
    expect(opts.allowUnauthenticatedClientRegistration).toBe(false);
  });

  it("adds and removes the metadata document discovery once", () => {
    const opts = options();
    const on = { ...DEFAULT_CLIENT_REGISTRATION_SETTINGS, metadataDocuments: true };
    applyClientRegistration(opts, on, extension);
    applyClientRegistration(opts, on, extension);
    expect(opts.extensions).toEqual([other, extension]);
    applyClientRegistration(opts, DEFAULT_CLIENT_REGISTRATION_SETTINGS, extension);
    expect(opts.extensions).toEqual([other]);
  });
});

describe("effectiveRegistrationScopes", () => {
  it("keeps the order of the settings", () => {
    expect(
      effectiveRegistrationScopes({ ...DEFAULT_CLIENT_REGISTRATION_SETTINGS, scopes: ["email", "openid"] }, ["openid", "email"]),
    ).toEqual(["email", "openid"]);
  });
});

describe("registrationRequestError", () => {
  it("allows interactive grants", () => {
    expect(registrationRequestError({})).toBeNull();
    expect(registrationRequestError({ grant_types: ["authorization_code", "refresh_token"] })).toBeNull();
  });

  it("refuses client_credentials and unknown grants", () => {
    expect(registrationRequestError({ grant_types: ["client_credentials"] })).toMatch(/client_credentials/);
    expect(registrationRequestError({ grant_types: ["authorization_code", "urn:x"] })).toMatch(/urn:x/);
    expect(registrationRequestError({ grant_types: "authorization_code" })).not.toBeNull();
  });
});

describe("metadataDocumentHostAllowed", () => {
  it("allows any host when the list is empty", () => {
    expect(metadataDocumentHostAllowed("https://a.example/client.json", [])).toBe(true);
  });

  it("matches exact hosts only", () => {
    expect(metadataDocumentHostAllowed("https://claude.ai/oauth/client", ["claude.ai"])).toBe(true);
    expect(metadataDocumentHostAllowed("https://evil.claude.ai.example/x", ["claude.ai"])).toBe(false);
    expect(metadataDocumentHostAllowed("https://sub.claude.ai/x", ["claude.ai"])).toBe(false);
    expect(metadataDocumentHostAllowed("not a url", ["claude.ai"])).toBe(false);
  });
});

describe("registrationSource", () => {
  it("is admin only with the explicit marker", () => {
    expect(registrationSource({ clientDiscoveryId: null, metadata: null, adminRegistered: true })).toBe("admin");
    expect(registrationSource({ metadata: { ostiary_registration: "other" }, adminRegistered: true })).toBe("admin");
  });

  it("fails closed: an unmarked client is self-registered", () => {
    expect(registrationSource({ clientDiscoveryId: null, metadata: null })).toBe("dynamic");
    expect(registrationSource({ clientDiscoveryId: null, metadata: null, adminRegistered: false })).toBe("dynamic");
    expect(registrationSource({ adminRegistered: null })).toBe("dynamic");
    // A self-registration marker wins over the admin one.
    expect(registrationSource({ metadata: markDynamicRegistration(null), adminRegistered: true })).toBe("dynamic");
    expect(registrationSource({ clientDiscoveryId: "cimd", adminRegistered: true })).toBe("metadata_document");
  });

  it("recognizes dynamic and metadata document clients", () => {
    expect(registrationSource({ metadata: markDynamicRegistration(null) })).toBe("dynamic");
    expect(registrationSource({ metadata: JSON.stringify({ ostiary_registration: "dynamic" }) })).toBe("dynamic");
    expect(registrationSource({ clientDiscoveryId: "cimd" })).toBe("metadata_document");
  });

  it("keeps existing metadata when marking", () => {
    expect(markDynamicRegistration('{"team":"a"}')).toEqual({ team: "a", ostiary_registration: "dynamic" });
  });
});

describe("clientActionAllowed", () => {
  const actions = ["create", "read", "list", "update", "rotate", "delete", "configure-client-credentials-scopes"];

  it("lets platform admins do everything", () => {
    for (const action of actions) {
      expect(clientActionAllowed({ action, isAdmin: true, path: "/admin/oauth2/create-client" })).toBe(true);
    }
  });

  it("gives other users no client management", () => {
    for (const action of actions) {
      for (const path of ["/oauth2/create-client", "/oauth2/update-client", "/oauth2/delete-client", "/oauth2/client/rotate-secret", "/oauth2/get-clients", "/oauth2/get-client", undefined]) {
        expect(clientActionAllowed({ action, isAdmin: false, path })).toBe(false);
      }
    }
  });

  it("still lets them self-register through dynamic registration", () => {
    expect(clientActionAllowed({ action: "create", isAdmin: false, path: "/oauth2/register" })).toBe(true);
    expect(clientActionAllowed({ action: "update", isAdmin: false, path: "/oauth2/register" })).toBe(false);
  });
});

describe("selfRegisteredUpdateError", () => {
  const allowed = ["openid", "profile", "email", "offline_access"];

  it("accepts changes within the self-registration policy", () => {
    expect(selfRegisteredUpdateError({ client_name: "Renamed", redirect_uris: ["https://a.example/cb"] }, allowed)).toBeNull();
    expect(selfRegisteredUpdateError({ scope: "openid email" }, allowed)).toBeNull();
    expect(selfRegisteredUpdateError({ grant_types: ["authorization_code", "refresh_token"] }, allowed)).toBeNull();
    expect(selfRegisteredUpdateError({ client_credentials_scopes: [] }, allowed)).toBeNull();
    expect(selfRegisteredUpdateError({ skip_consent: false }, allowed)).toBeNull();
    expect(selfRegisteredUpdateError(undefined, allowed)).toBeNull();
  });

  it("refuses scopes outside the allowed list", () => {
    expect(selfRegisteredUpdateError({ scope: "openid orders:write" }, allowed)).toMatch(/orders:write/);
    expect(selfRegisteredUpdateError({ scope: ["openid"] }, allowed)).not.toBeNull();
  });

  it("refuses machine access, device sign-in and skipping consent", () => {
    expect(selfRegisteredUpdateError({ grant_types: ["client_credentials"] }, allowed)).toMatch(/client_credentials/);
    expect(selfRegisteredUpdateError({ grant_types: ["authorization_code", "urn:ietf:params:oauth:grant-type:device_code"] }, allowed)).toMatch(/device_code/);
    expect(selfRegisteredUpdateError({ client_credentials_scopes: ["openid"] }, allowed)).not.toBeNull();
    expect(selfRegisteredUpdateError({ skip_consent: true }, allowed)).toMatch(/consent/);
  });
});

describe("requestClientIds", () => {
  const basic = (id: string, secret = "s3cret") =>
    new Headers({ authorization: `Basic ${Buffer.from(`${encodeURIComponent(id)}:${secret}`).toString("base64")}` });
  const assertion = (claims: Record<string, unknown>) =>
    `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

  it("reads the body's client_id", () => {
    expect(requestClientIds(new Headers(), { client_id: "abc" })).toEqual(["abc"]);
  });

  it("reads HTTP Basic client authentication when the body names no client", () => {
    expect(requestClientIds(basic("dyn-client"), { client_id: "" })).toEqual(["dyn-client"]);
    expect(requestClientIds(basic("a b:c"), {})).toEqual(["a b:c"]);
  });

  it("reads a client assertion's subject and issuer", () => {
    expect(requestClientIds(null, { client_assertion: assertion({ iss: "kid-client", sub: "kid-client" }) })).toEqual(["kid-client"]);
    expect(requestClientIds(null, { client_assertion: assertion({ iss: "a", sub: "b" }) }).sort()).toEqual(["a", "b"]);
  });

  it("lists every id the request names", () => {
    expect(requestClientIds(basic("from-header"), { client_id: "from-body" }).sort()).toEqual(["from-body", "from-header"]);
  });

  it("returns nothing for missing or malformed authentication", () => {
    expect(requestClientIds(undefined, undefined)).toEqual([]);
    expect(requestClientIds(new Headers({ authorization: "Bearer x" }), { client_assertion: "not-a-jwt" })).toEqual([]);
    expect(requestClientIds(new Headers({ authorization: "Basic !!!" }), {})).toEqual([]);
  });
});
