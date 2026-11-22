import { describe, expect, it } from "vitest";
import { brand } from "@ostiary/core/lib/brand";
import { getPasskeyWebAuthnOptions } from "@ostiary/core/lib/passkey-options";

describe("getPasskeyWebAuthnOptions", () => {
  it("names the relying party after the product", () => {
    expect(getPasskeyWebAuthnOptions("https://auth.example.com").rpName).toBe(brand.name);
    expect(getPasskeyWebAuthnOptions("not a url").rpName).toBe(brand.name);
  });

  it("uses the host as RP ID and the origin without a path", () => {
    expect(getPasskeyWebAuthnOptions("https://auth.example.com:8443/api/auth")).toMatchObject({
      rpID: "auth.example.com",
      origin: "https://auth.example.com:8443",
    });
  });
});
