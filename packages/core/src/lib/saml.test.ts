import { describe, expect, it } from "vitest";

import {
  buildSamlConfig,
  containsDtd,
  normalizeSamlMapping,
  parseIdpMetadata,
  parseSamlCertificate,
  SAML_PRESET_MAPPINGS,
  SAML_PROVIDER_ID_PATTERN,
  samlResponseRejection,
  samlServiceProviderUrls,
  summarizeSamlConfig,
  weakSignatureAlgorithm,
} from "@ostiary/core/lib/saml";
import { fetchSamlMetadata } from "@ostiary/core/lib/saml-metadata-fetch";

// Self-signed test certificate (CN=Ostiary Test IdP), valid 2026-10-09 to 2036-10-06.
const CERT_BODY = "MIIDFzCCAf+gAwIBAgIUXaVFOiOqy+gkcDNOM8IKDtpUGfwwDQYJKoZIhvcNAQELBQAwGzEZMBcGA1UEAwwQT3N0aWFyeSBUZXN0IElkUDAeFw0yNjEwMDkxNDIwMTlaFw0zNjEwMDYxNDIwMTlaMBsxGTAXBgNVBAMMEE9zdGlhcnkgVGVzdCBJZFAwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDFEobGY2UuOdnIdApn7hyoWSoQI+rnMUxN5vREptdAZ4JJflLWJ7yotZoikAARjDCo7flqchDxRN61SohGN3Ly+AOO5tgrEeJfInD6qjHR3ntHOVDpALjzki27YShcB32qp1v04unCYck4IWvMrouM8mEEPlwPpqTMz8z1IU8HbVvndW+mMajqISAcKhYu8lgOh3AlDoBAL+IvG7nz3KtO5M9i8BsptXVAcSh8nReYPNn5NPw+PDpmhnfd8l7lug5eIZve154EomxlHcFzEXLLITQt4mnyAfvhU0fIeN0J6anNll/yNesoAilTt3ajeRuITYOdPVu6Kim58rBkTBiVAgMBAAGjUzBRMB0GA1UdDgQWBBTGO+02MBlWjasL0RK+Jce0rXT3XjAfBgNVHSMEGDAWgBTGO+02MBlWjasL0RK+Jce0rXT3XjAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQCcrjczJWF7UZlsn8T0KmyjprSNFSCQo446T63U2pRzeI7ekcQ/gaZb8sB3QrOEfRMEW6Vpy2cI2McJHfX3keH7SS6uavYVcOi7mfZtNghsNL1FabW2+yHMT06PHWClTTA50P4bMrOIiKrmdZGP6LekwizHa8UeXfHzoUA3jW2DhlZ8qeAbPTWWdk7S2ommoOEJSpzabwYVGqWXxDMLD00fLb/AxZGp5GROkocElycggxlIaXPel60QkzKW8Z5Cqxpxpcz7lEURtXBLRY/3gV8ScFfAyy8cjYVGe4AICTPmPL8K/w5VmlIs7TcsXJojwRpPmpSK8xdO/LqWeHPyvrcd";
const CERT_PEM = `-----BEGIN CERTIFICATE-----\n${CERT_BODY.match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----`;
const NOW = new Date("2027-01-01T00:00:00Z");
const AFTER_EXPIRY = new Date("2037-01-01T00:00:00Z");

const REDIRECT = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect";
const POST = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST";

function metadata({
  entityId = "https://idp.example.com/entity",
  bindings = [REDIRECT, POST],
  cert = CERT_BODY,
  use = "signing",
  wantSigned = false,
  prefix = "",
}: { entityId?: string; bindings?: string[]; cert?: string | null; use?: string | null; wantSigned?: boolean; prefix?: string } = {}) {
  const key = cert === null ? "" : `<md:KeyDescriptor${use ? ` use="${use}"` : ""}><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${cert}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor>`;
  const sso = bindings.map((b) => `<md:SingleSignOnService Binding="${b}" Location="https://idp.example.com/sso/${b.endsWith("Redirect") ? "redirect" : "post"}"/>`).join("");
  return `${prefix}<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" entityID="${entityId}"><md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"${wantSigned ? ' WantAuthnRequestsSigned="true"' : ""}>${key}${sso}</md:IDPSSODescriptor></md:EntityDescriptor>`;
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

describe("SP URLs", () => {
  it("derives the ACS URL, entity ID and metadata URL from the auth app URL", () => {
    expect(samlServiceProviderUrls("https://auth.example.com/", "acme-okta")).toEqual({
      acsUrl: "https://auth.example.com/api/auth/sso/saml2/sp/acs/acme-okta",
      entityId: "https://auth.example.com/api/auth/sso/saml2/sp/metadata?providerId=acme-okta",
      metadataUrl: "https://auth.example.com/api/auth/sso/saml2/sp/metadata?providerId=acme-okta",
    });
  });

  it("only accepts URL-safe provider IDs", () => {
    expect(SAML_PROVIDER_ID_PATTERN.test("acme-okta")).toBe(true);
    for (const bad of ["a", "Acme", "acme/okta", "acme okta", "-acme", "../x", "a".repeat(64)]) {
      expect(SAML_PROVIDER_ID_PATTERN.test(bad)).toBe(false);
    }
  });
});

describe("DTD and response guard", () => {
  it("detects DOCTYPE and entity declarations in any case", () => {
    expect(containsDtd('<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><a/>')).toBe(true);
    expect(containsDtd("<!doctype x><a/>")).toBe(true);
    expect(containsDtd('<! ENTITY a "b">')).toBe(true);
    expect(containsDtd("<samlp:Response/>")).toBe(false);
  });

  it("refuses a SAMLResponse with a DTD, bad base64 or too large, accepts a plain one", () => {
    expect(samlResponseRejection(undefined)).toMatch(/Missing/);
    expect(samlResponseRejection("not base64!")).toMatch(/base64/);
    expect(samlResponseRejection(b64('<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x "y">]><samlp:Response/>'))).toMatch(/DTD/);
    expect(samlResponseRejection(b64("<samlp:Response>" + "a".repeat(300 * 1024) + "</samlp:Response>"))).toMatch(/too large/);
    const ok = b64('<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"/>');
    expect(samlResponseRejection(ok)).toBeNull();
    // Line-wrapped base64, as some IdPs send it.
    expect(samlResponseRejection(ok.replace(/(.{20})/g, "$1\r\n"))).toBeNull();
  });
});

describe("signature algorithms", () => {
  const signed = (sig: string, digest: string) =>
    `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"><ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:SignedInfo><ds:SignatureMethod Algorithm="${sig}"/><ds:Reference><ds:DigestMethod Algorithm="${digest}"/></ds:Reference></ds:SignedInfo></ds:Signature></samlp:Response>`;
  const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
  const SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";

  it("accepts SHA-256 signatures and refuses SHA-1 or unknown algorithms", () => {
    expect(weakSignatureAlgorithm(signed(RSA_SHA256, SHA256))).toBeNull();
    expect(weakSignatureAlgorithm(signed("http://www.w3.org/2000/09/xmldsig#rsa-sha1", SHA256))).toContain("rsa-sha1");
    expect(weakSignatureAlgorithm(signed(RSA_SHA256, "http://www.w3.org/2000/09/xmldsig#sha1"))).toContain("sha1");
    expect(weakSignatureAlgorithm(signed("urn:made-up", SHA256))).toBe("urn:made-up");
    // Unprefixed elements and single quotes too.
    expect(weakSignatureAlgorithm("<SignatureMethod Algorithm='http://www.w3.org/2000/09/xmldsig#rsa-sha1'/>")).not.toBeNull();
  });

  it("refuses a SHA-1 signed SAMLResponse at the guard", () => {
    expect(samlResponseRejection(b64(signed("http://www.w3.org/2000/09/xmldsig#rsa-sha1", SHA256)))).toMatch(/deprecated algorithm/);
    expect(samlResponseRejection(b64(signed(RSA_SHA256, SHA256)))).toBeNull();
  });
});

describe("certificates", () => {
  it("reads PEM and bare base64 and reports expiry", () => {
    const fromPem = parseSamlCertificate(CERT_PEM, NOW);
    const fromBody = parseSamlCertificate(CERT_BODY, NOW);
    expect(fromPem?.subject).toContain("Ostiary Test IdP");
    expect(fromPem?.expired).toBe(false);
    expect(fromBody?.pem).toBe(fromPem?.pem);
    expect(parseSamlCertificate(CERT_BODY, AFTER_EXPIRY)?.expired).toBe(true);
  });

  it("refuses something that is not a certificate", () => {
    expect(parseSamlCertificate("hello")).toBeNull();
    expect(parseSamlCertificate(b64("not a certificate"))).toBeNull();
    expect(parseSamlCertificate("")).toBeNull();
  });
});

describe("IdP metadata", () => {
  it("extracts entity ID, redirect SSO URL and signing certificates", () => {
    const result = parseIdpMetadata(metadata(), NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metadata.entityId).toBe("https://idp.example.com/entity");
    expect(result.metadata.ssoUrl).toBe("https://idp.example.com/sso/redirect");
    expect(result.metadata.certificates).toHaveLength(1);
  });

  it("accepts a key without a use attribute and an EntitiesDescriptor with one entity", () => {
    expect(parseIdpMetadata(metadata({ use: null }), NOW).ok).toBe(true);
    const wrapped = `<md:EntitiesDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata">${metadata()}</md:EntitiesDescriptor>`;
    expect(parseIdpMetadata(wrapped, NOW).ok).toBe(true);
  });

  it.each([
    ["a DOCTYPE", metadata({ prefix: '<!DOCTYPE md [<!ENTITY x SYSTEM "file:///etc/passwd">]>' }), "DOCTYPE"],
    ["malformed XML", "<md:EntityDescriptor", "well-formed"],
    ["not metadata", "<html><body/></html>", "not SAML metadata"],
    ["no entityID", metadata({ entityId: "" }), "entityID"],
    ["no redirect binding", metadata({ bindings: [POST] }), "HTTP-Redirect"],
    ["no certificate", metadata({ cert: null }), "no signing certificate"],
    ["only an encryption key", metadata({ use: "encryption" }), "no signing certificate"],
    ["an unreadable certificate", metadata({ cert: "AAAA" }), "could not be read"],
    ["signed requests required", metadata({ wantSigned: true }), "signed requests"],
  ])("refuses %s", (_label, xml, message) => {
    const result = parseIdpMetadata(xml, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });

  it("refuses two entities and oversized metadata", () => {
    const two = `<md:EntitiesDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata">${metadata()}${metadata({ entityId: "https://other" })}</md:EntitiesDescriptor>`;
    expect(parseIdpMetadata(two, NOW).ok).toBe(false);
    expect(parseIdpMetadata(metadata({ prefix: "<!-- " + "x".repeat(101 * 1024) + " -->" }), NOW).ok).toBe(false);
  });
});

describe("attribute mapping", () => {
  it("requires email and name attributes and trims the rest", () => {
    expect(normalizeSamlMapping({ email: " email ", name: "displayName", firstName: " ", lastName: "sn" })).toEqual({ email: "email", name: "displayName", lastName: "sn" });
    expect(normalizeSamlMapping({ email: "", name: "x" })).toBeNull();
    expect(normalizeSamlMapping({ email: "e mail", name: "x" })).toBeNull();
    expect(normalizeSamlMapping({ email: 'e"', name: "x" })).toBeNull();
  });

  it("has a preset per IdP that passes validation", () => {
    for (const preset of Object.values(SAML_PRESET_MAPPINGS)) expect(normalizeSamlMapping(preset)).toEqual(preset);
  });
});

describe("provider config", () => {
  const mapping = SAML_PRESET_MAPPINGS.entra;

  it("builds a metadata-based config that requires signed assertions and never signs requests", () => {
    const result = buildSamlConfig({ idp: { source: "xml", xml: metadata() }, mapping, wantAssertionsSigned: true }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config).toMatchObject({ entryPoint: "https://idp.example.com/sso/redirect", wantAssertionsSigned: true, authnRequestsSigned: false, mapping });
    expect("metadata" in result.config.idpMetadata).toBe(true);
  });

  it("builds a manual config with the IdP entity ID, redirect endpoint and certificate", () => {
    const result = buildSamlConfig(
      { idp: { source: "manual", entityId: "urn:idp", ssoUrl: "https://idp.example.com/sso", certificate: CERT_BODY }, mapping, wantAssertionsSigned: true },
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.idpMetadata).toEqual({
      entityID: "urn:idp",
      cert: CERT_PEM,
      singleSignOnService: [{ Binding: REDIRECT, Location: "https://idp.example.com/sso" }],
    });
  });

  it.each([
    ["no entity ID", { entityId: " ", ssoUrl: "https://idp/sso", certificate: CERT_BODY }, "entity ID"],
    ["a non-http SSO URL", { entityId: "urn:idp", ssoUrl: "javascript:alert(1)", certificate: CERT_BODY }, "https"],
    ["a bad certificate", { entityId: "urn:idp", ssoUrl: "https://idp/sso", certificate: "nope" }, "X.509"],
  ])("refuses a manual config with %s", (_label, idp, message) => {
    const result = buildSamlConfig({ idp: { source: "manual", ...idp }, mapping, wantAssertionsSigned: true }, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });

  it("refuses expired certificates and a mapping without email", () => {
    const manual = buildSamlConfig({ idp: { source: "manual", entityId: "urn:idp", ssoUrl: "https://idp/sso", certificate: CERT_BODY }, mapping, wantAssertionsSigned: true }, AFTER_EXPIRY);
    expect(manual.ok).toBe(false);
    const xml = buildSamlConfig({ idp: { source: "xml", xml: metadata() }, mapping, wantAssertionsSigned: true }, AFTER_EXPIRY);
    expect(xml.ok).toBe(false);
    const noEmail = buildSamlConfig({ idp: { source: "xml", xml: metadata() }, mapping: { ...mapping, email: "" }, wantAssertionsSigned: true }, NOW);
    expect(noEmail.ok).toBe(false);
  });

  it("summarizes a stored config for the admin console", () => {
    const built = buildSamlConfig({ idp: { source: "xml", xml: metadata() }, mapping, wantAssertionsSigned: false }, NOW);
    if (!built.ok) throw new Error(built.error);
    const summary = summarizeSamlConfig(JSON.stringify({ ...built.config, issuer: "sp" }), NOW);
    expect(summary).toMatchObject({ idpEntityId: "https://idp.example.com/entity", wantAssertionsSigned: false, certificateExpired: false, source: "metadata", mapping });
    expect(summarizeSamlConfig(null)).toBeNull();
    expect(summarizeSamlConfig("{broken")).toBeNull();
  });
});

describe("metadata URL fetch", () => {
  const publicHost = async () => [{ address: "93.184.215.14", family: 4 }];

  it("refuses private and plain-http URLs without connecting", async () => {
    let called = false;
    const get = async () => {
      called = true;
      return { ok: false as const, error: "x" };
    };
    expect((await fetchSamlMetadata("https://169.254.169.254/metadata", { get })).ok).toBe(false);
    expect((await fetchSamlMetadata("http://idp.example.com/metadata", { get, lookup: publicHost })).ok).toBe(false);
    expect((await fetchSamlMetadata("https://idp.example.com/m", { get, lookup: async () => [{ address: "10.0.0.1", family: 4 }] })).ok).toBe(false);
    expect(called).toBe(false);
  });

  it("returns the body, re-checks redirects and refuses truncated answers", async () => {
    const xml = metadata();
    const ok = await fetchSamlMetadata("https://idp.example.com/m", {
      lookup: publicHost,
      get: async () => ({ ok: true, status: 200, headers: {}, body: Buffer.from(xml), truncated: false }),
    });
    expect(ok).toEqual({ ok: true, xml });

    const redirectedToPrivate = await fetchSamlMetadata("https://idp.example.com/m", {
      lookup: async (host) => (host === "idp.example.com" ? publicHost() : [{ address: "127.0.0.1", family: 4 }]),
      get: async () => ({ ok: true, status: 302, headers: { location: "https://internal.example.com/" }, body: Buffer.alloc(0), truncated: false }),
    });
    expect(redirectedToPrivate.ok).toBe(false);

    const big = await fetchSamlMetadata("https://idp.example.com/m", {
      lookup: publicHost,
      get: async () => ({ ok: true, status: 200, headers: {}, body: Buffer.alloc(10), truncated: true }),
    });
    expect(big.ok).toBe(false);
  });
});
