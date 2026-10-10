import { X509Certificate } from "node:crypto";
import { DOMParser, type Element as XmlElement } from "@xmldom/xmldom";

import { normalizeSamlMapping, type SamlMapping } from "@ostiary/core/lib/saml-presets";

export * from "@ostiary/core/lib/saml-presets";

/*
 * SAML 2.0 enterprise SSO runs on @better-auth/sso (samlify underneath): the plugin builds the
 * AuthnRequest, serves the SP metadata and validates the response at the ACS (signature,
 * audience, recipient, destination, InResponseTo, one-time assertion IDs, timestamps). What
 * lives here is what Ostiary adds around it:
 * - the admin side: IdP metadata checks (one IdP, a redirect SSO endpoint, a usable signing
 *   certificate, no DTD) and attribute-mapping presets;
 * - a guard in front of the ACS that refuses responses carrying a DTD or entity declaration
 *   before any XML parser sees them (see `samlResponseRejection`).
 */

/** Same cap as the plugin's `maxMetadataSize` default. */
export const MAX_SAML_METADATA_BYTES = 100 * 1024;
/** Same cap as the plugin's `maxResponseSize` default. */
const MAX_SAML_RESPONSE_BYTES = 256 * 1024;
/** Tolerance for IdP clock drift on NotBefore / NotOnOrAfter (the plugin's default is 5 minutes). */
export const SAML_CLOCK_SKEW_MS = 60_000;

const MD_NS = "urn:oasis:names:tc:SAML:2.0:metadata";
const DSIG_NS = "http://www.w3.org/2000/09/xmldsig#";
const SAML_REDIRECT_BINDING = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect";

// ---------------------------------------------------------------------------------------------
// XML safety
// ---------------------------------------------------------------------------------------------

/**
 * A DOCTYPE (and with it ENTITY declarations) has no place in SAML messages or metadata and is
 * the vector for XXE and entity-expansion attacks. Refuse it outright rather than rely on each
 * parser down the line ignoring it.
 */
export function containsDtd(xml: string): boolean {
  return /<!\s*(DOCTYPE|ENTITY|ELEMENT|ATTLIST)/i.test(xml);
}

/**
 * Checks a SAMLResponse form value before the plugin parses it. Returns why it is refused,
 * or null. The plugin re-checks size and encoding; the DTD check is ours.
 */
export function samlResponseRejection(value: unknown): string | null {
  if (typeof value !== "string" || !value) return "Missing SAMLResponse";
  const compact = value.replace(/\s+/g, "");
  if (compact.length > Math.ceil((MAX_SAML_RESPONSE_BYTES * 4) / 3) + 4) return "SAML response is too large";
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return "SAML response is not base64";
  const xml = Buffer.from(compact, "base64").toString("utf8");
  if (Buffer.byteLength(xml) > MAX_SAML_RESPONSE_BYTES) return "SAML response is too large";
  if (containsDtd(xml)) return "SAML response must not contain a DTD";
  const weak = weakSignatureAlgorithm(xml);
  if (weak) return `SAML response is signed with a deprecated algorithm (${weak}); configure the identity provider to use SHA-256`;
  return null;
}

/** Signature and digest algorithms accepted in XML signatures (SHA-256 and stronger). */
const ALLOWED_XMLDSIG_ALGORITHMS = new Set([
  "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
  "http://www.w3.org/2001/04/xmldsig-more#rsa-sha384",
  "http://www.w3.org/2001/04/xmldsig-more#rsa-sha512",
  "http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256",
  "http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha384",
  "http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512",
  "http://www.w3.org/2007/05/xmldsig-more#sha256-rsa-MGF1",
  "http://www.w3.org/2001/04/xmlenc#sha256",
  "http://www.w3.org/2001/04/xmldsig-more#sha384",
  "http://www.w3.org/2001/04/xmlenc#sha512",
]);

/**
 * The first SignatureMethod or DigestMethod outside the SHA-256+ list, or null. The plugin's
 * own algorithm check only sees the query-string SigAlg of the Redirect binding, so for POST
 * responses (the ACS) the embedded XML signature's algorithms are checked here: SHA-1 (and
 * anything unknown) is refused.
 */
export function weakSignatureAlgorithm(xml: string): string | null {
  const pattern = /<(?:[\w.-]+:)?(SignatureMethod|DigestMethod)\b[^>]*?\bAlgorithm\s*=\s*(["'])([^"']*)\2/g;
  for (const match of xml.matchAll(pattern)) {
    if (!ALLOWED_XMLDSIG_ALGORITHMS.has(match[3]!)) return match[3]!;
  }
  return null;
}

function parseXml(xml: string): Document {
  // Typed loosely: another copy of @xmldom/xmldom (0.8, without `onError`) can win the type lookup.
  const options = {
    onError: (level: string, message: string) => {
      if (level !== "warning") throw new Error(message);
    },
  };
  const parser = new DOMParser(options as never);
  return parser.parseFromString(xml, "text/xml") as unknown as Document;
}

// ---------------------------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------------------------

export type SamlCertificateInfo = { pem: string; subject: string; notAfter: string; expired: boolean };

/** Accepts a PEM certificate or its bare base64 body (as metadata carries it). */
export function parseSamlCertificate(input: string, now = new Date()): SamlCertificateInfo | null {
  const body = input
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "");
  if (!body || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return null;
  const pem = `-----BEGIN CERTIFICATE-----\n${body.match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----`;
  try {
    const cert = new X509Certificate(pem);
    const notAfter = new Date(cert.validTo);
    return { pem, subject: cert.subject.replace(/\n/g, ", "), notAfter: notAfter.toISOString(), expired: notAfter < now };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// IdP metadata
// ---------------------------------------------------------------------------------------------

export type ParsedIdpMetadata = {
  entityId: string;
  ssoUrl: string;
  certificates: SamlCertificateInfo[];
};

/**
 * Why IdP metadata or settings were refused. `error` is the English message (logs, tests);
 * `code` (with `values`) lets the admin console show it in the admin's language.
 */
export type SamlErrorCode =
  | "metadataEmpty"
  | "metadataTooLarge"
  | "metadataDoctype"
  | "metadataNotXml"
  | "notSamlMetadata"
  | "multipleEntities"
  | "noEntityId"
  | "noIdpDescriptor"
  | "noSaml2"
  | "signedRequestsRequired"
  | "noRedirectBinding"
  | "metadataSsoUrlNotHttps"
  | "unreadableCertificate"
  | "noSigningCertificate"
  | "invalidMapping"
  | "allCertificatesExpired"
  | "missingEntityId"
  | "ssoUrlNotHttps"
  | "invalidCertificate"
  | "certificateExpired"
  | "fetchFailed"
  | "invalidRedirect"
  | "httpStatus"
  | "tooManyRedirects";

export type SamlError = { ok: false; error: string; code: SamlErrorCode; values?: Record<string, string | number> };

export type IdpMetadataResult = { ok: true; metadata: ParsedIdpMetadata } | SamlError;

function children(parent: XmlElement, ns: string, localName: string): XmlElement[] {
  const out: XmlElement[] = [];
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1) {
      const el = node as XmlElement;
      if (el.namespaceURI === ns && el.localName === localName) out.push(el);
    }
  }
  return out;
}

/** https, or http outside production (a local test IdP). */
function isAllowedSsoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && process.env.NODE_ENV !== "production");
  } catch {
    return false;
  }
}

/**
 * Validates IdP metadata XML and extracts what Ostiary relies on. Refused: a DTD, more than
 * one entity, no IdP role, no HTTP-Redirect SSO endpoint (the plugin sends the AuthnRequest
 * with that binding), no signing certificate, or an IdP that requires signed AuthnRequests
 * (Ostiary does not sign them).
 */
export function parseIdpMetadata(xml: string, now = new Date()): IdpMetadataResult {
  const text = xml.trim();
  if (!text) return { ok: false, error: "The metadata is empty.", code: "metadataEmpty" };
  if (Buffer.byteLength(text) > MAX_SAML_METADATA_BYTES) return { ok: false, error: "The metadata is larger than 100 KB.", code: "metadataTooLarge" };
  if (containsDtd(text)) return { ok: false, error: "The metadata must not contain a DOCTYPE.", code: "metadataDoctype" };
  let doc: Document;
  try {
    doc = parseXml(text);
  } catch {
    return { ok: false, error: "The metadata is not well-formed XML.", code: "metadataNotXml" };
  }
  const root = doc.documentElement as unknown as XmlElement | null;
  if (!root || root.namespaceURI !== MD_NS) return { ok: false, error: "This is not SAML metadata.", code: "notSamlMetadata" };
  let entity: XmlElement | undefined = root;
  if (root.localName === "EntitiesDescriptor") {
    const entities = children(root, MD_NS, "EntityDescriptor");
    if (entities.length !== 1) return { ok: false, error: "The metadata must describe exactly one identity provider.", code: "multipleEntities" };
    entity = entities[0];
  } else if (root.localName !== "EntityDescriptor") {
    return { ok: false, error: "This is not SAML metadata.", code: "notSamlMetadata" };
  }
  const entityId = entity!.getAttribute("entityID")?.trim();
  if (!entityId) return { ok: false, error: "The metadata has no entityID.", code: "noEntityId" };
  const idps = children(entity!, MD_NS, "IDPSSODescriptor");
  if (idps.length !== 1) return { ok: false, error: "The metadata has no identity provider (IDPSSODescriptor).", code: "noIdpDescriptor" };
  const idp = idps[0]!;
  if (!(idp.getAttribute("protocolSupportEnumeration") ?? "").includes("urn:oasis:names:tc:SAML:2.0:protocol")) {
    return { ok: false, error: "The identity provider does not support SAML 2.0.", code: "noSaml2" };
  }
  if (idp.getAttribute("WantAuthnRequestsSigned") === "true" || idp.getAttribute("WantAuthnRequestsSigned") === "1") {
    return { ok: false, error: "The identity provider requires signed requests, which Ostiary does not send. Turn off request signing in the identity provider.", code: "signedRequestsRequired" };
  }
  const redirect = children(idp, MD_NS, "SingleSignOnService").find((s) => s.getAttribute("Binding") === SAML_REDIRECT_BINDING);
  const ssoUrl = redirect?.getAttribute("Location")?.trim() ?? "";
  if (!ssoUrl) return { ok: false, error: "The metadata has no SingleSignOnService with the HTTP-Redirect binding.", code: "noRedirectBinding" };
  if (!isAllowedSsoUrl(ssoUrl)) return { ok: false, error: "The identity provider's SSO URL must use https://.", code: "metadataSsoUrlNotHttps" };
  const certificates: SamlCertificateInfo[] = [];
  for (const key of children(idp, MD_NS, "KeyDescriptor")) {
    const use = key.getAttribute("use");
    if (use && use !== "signing") continue;
    for (const info of children(key, DSIG_NS, "KeyInfo")) {
      for (const data of children(info, DSIG_NS, "X509Data")) {
        for (const certEl of children(data, DSIG_NS, "X509Certificate")) {
          const cert = parseSamlCertificate(certEl.textContent ?? "", now);
          if (!cert) return { ok: false, error: "A signing certificate in the metadata could not be read.", code: "unreadableCertificate" };
          certificates.push(cert);
        }
      }
    }
  }
  if (certificates.length === 0) return { ok: false, error: "The metadata has no signing certificate.", code: "noSigningCertificate" };
  return { ok: true, metadata: { entityId, ssoUrl, certificates } };
}

// ---------------------------------------------------------------------------------------------
// Provider configuration
// ---------------------------------------------------------------------------------------------

export type SamlIdpInput =
  | { source: "xml"; xml: string }
  | { source: "manual"; entityId: string; ssoUrl: string; certificate: string };

export type SamlConfigInput = {
  /** The SP entity ID, also the provider row's `issuer`. */
  spEntityId: string;
  idp: SamlIdpInput;
  mapping: SamlMapping;
  wantAssertionsSigned: boolean;
};

/** The `samlConfig` Ostiary stores, a subset of the plugin's SAMLConfig. */
export type StoredSamlConfig = {
  issuer: string;
  entryPoint: string;
  cert?: string;
  idpMetadata: { metadata: string } | { entityID: string; cert: string; singleSignOnService: Array<{ Binding: string; Location: string }> };
  wantAssertionsSigned: boolean;
  authnRequestsSigned: false;
  mapping: SamlMapping;
};

export type SamlConfigResult =
  | { ok: true; config: Omit<StoredSamlConfig, "issuer">; idp: ParsedIdpMetadata }
  | SamlError;

/** Validates the IdP side and builds the plugin's samlConfig (minus `issuer`, set from the body). */
export function buildSamlConfig(input: Omit<SamlConfigInput, "spEntityId">, now = new Date()): SamlConfigResult {
  const mapping = normalizeSamlMapping(input.mapping);
  if (!mapping) return { ok: false, error: "Enter the attribute names for email and name (no spaces or quotes).", code: "invalidMapping" };
  const base = { wantAssertionsSigned: input.wantAssertionsSigned, authnRequestsSigned: false as const, mapping };
  if (input.idp.source === "xml") {
    const parsed = parseIdpMetadata(input.idp.xml, now);
    if (!parsed.ok) return parsed;
    if (parsed.metadata.certificates.every((c) => c.expired)) return { ok: false, error: "Every signing certificate in the metadata has expired.", code: "allCertificatesExpired" };
    return {
      ok: true,
      idp: parsed.metadata,
      config: { ...base, entryPoint: parsed.metadata.ssoUrl, idpMetadata: { metadata: input.idp.xml.trim() } },
    };
  }
  const entityId = input.idp.entityId.trim();
  const ssoUrl = input.idp.ssoUrl.trim();
  if (!entityId || entityId.length > 1024) return { ok: false, error: "Enter the identity provider's entity ID (issuer).", code: "missingEntityId" };
  if (!isAllowedSsoUrl(ssoUrl)) return { ok: false, error: "The SSO URL must be an https:// URL.", code: "ssoUrlNotHttps" };
  const cert = parseSamlCertificate(input.idp.certificate, now);
  if (!cert) return { ok: false, error: "The signing certificate is not a valid X.509 certificate (PEM).", code: "invalidCertificate" };
  if (cert.expired) return { ok: false, error: "The signing certificate has expired.", code: "certificateExpired" };
  return {
    ok: true,
    idp: { entityId, ssoUrl, certificates: [cert] },
    config: {
      ...base,
      entryPoint: ssoUrl,
      cert: cert.pem,
      idpMetadata: { entityID: entityId, cert: cert.pem, singleSignOnService: [{ Binding: SAML_REDIRECT_BINDING, Location: ssoUrl }] },
    },
  };
}

/** What the admin console shows about a stored SAML provider (never the raw config). */
export type SamlProviderSummary = {
  idpEntityId: string | null;
  ssoUrl: string | null;
  certificateExpiresAt: string | null;
  certificateExpired: boolean;
  wantAssertionsSigned: boolean;
  mapping: SamlMapping | null;
  source: "metadata" | "manual";
};

export function summarizeSamlConfig(raw: string | null, now = new Date()): SamlProviderSummary | null {
  if (!raw) return null;
  let config: Partial<StoredSamlConfig> & { idpMetadata?: Record<string, unknown> };
  try {
    config = JSON.parse(raw);
  } catch {
    return null;
  }
  const metadataXml = typeof config.idpMetadata?.metadata === "string" ? config.idpMetadata.metadata : null;
  let entityId: string | null = null;
  let ssoUrl: string | null = config.entryPoint ?? null;
  let certs: SamlCertificateInfo[] = [];
  if (metadataXml) {
    const parsed = parseIdpMetadata(metadataXml, now);
    if (parsed.ok) {
      entityId = parsed.metadata.entityId;
      ssoUrl = parsed.metadata.ssoUrl;
      certs = parsed.metadata.certificates;
    }
  } else {
    entityId = typeof config.idpMetadata?.entityID === "string" ? config.idpMetadata.entityID : null;
    const pem = typeof config.idpMetadata?.cert === "string" ? config.idpMetadata.cert : config.cert;
    const cert = typeof pem === "string" ? parseSamlCertificate(pem, now) : null;
    if (cert) certs = [cert];
  }
  // The latest expiry: rotation metadata lists the old and the new certificate.
  const latest = certs.map((c) => c.notAfter).sort().at(-1) ?? null;
  return {
    idpEntityId: entityId,
    ssoUrl,
    certificateExpiresAt: latest,
    certificateExpired: latest ? new Date(latest) < now : false,
    wantAssertionsSigned: config.wantAssertionsSigned === true,
    mapping: config.mapping ?? null,
    source: metadataXml ? "metadata" : "manual",
  };
}
