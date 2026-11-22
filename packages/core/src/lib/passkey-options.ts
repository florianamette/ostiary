import { brand } from "@ostiary/core/lib/brand";

/** Shown by password managers and the OS next to the saved passkey. */
const RP_NAME = brand.name;

/**
 * WebAuthn options derived from the same base URL as Better Auth (`BETTER_AUTH_URL`, etc.).
 * @see https://better-auth.com/docs/plugins/passkey#options
 */
export function getPasskeyWebAuthnOptions(baseURL: string): {
  rpID: string;
  origin: string;
  rpName: string;
} {
  const base = baseURL;
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return { rpID: "localhost", origin: base, rpName: RP_NAME };
  }

  const hostname = url.hostname;
  /** `localhost` is the usual dev RP ID; `127.0.0.1` must use that host as rpID when visited via IP. */
  const rpID = hostname === "localhost" ? "localhost" : hostname;
  const origin = `${url.protocol}//${url.host}`;

  return { rpID, origin, rpName: RP_NAME };
}
