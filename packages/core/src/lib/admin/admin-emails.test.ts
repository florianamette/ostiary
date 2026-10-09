import { describe, expect, it } from "vitest";

import { adminOnSignUp, adminOnVerification, parseAdminEmails } from "@ostiary/core/lib/admin/admin-emails";

const admins = parseAdminEmails(" Owner@Example.com, ,second@example.com ");

describe("parseAdminEmails", () => {
  it("lowercases, trims and drops empty entries", () => {
    expect([...admins]).toEqual(["owner@example.com", "second@example.com"]);
    expect(parseAdminEmails(undefined).size).toBe(0);
  });
});

describe("adminOnSignUp", () => {
  it("never promotes an address that is not verified (password sign-up, unverified provider email)", () => {
    expect(adminOnSignUp({ email: "owner@example.com", emailVerified: false }, "/sign-up/email", admins)).toBe(false);
    expect(adminOnSignUp({ email: "owner@example.com", emailVerified: false }, "/callback/gitlab", admins)).toBe(false);
    expect(adminOnSignUp({ email: "owner@example.com" }, "/callback/gitlab", admins)).toBe(false);
  });

  it("does not trust a truthy value that is not `true` (\"false\" from a provider)", () => {
    expect(adminOnSignUp({ email: "owner@example.com", emailVerified: "false" as never }, "/callback/cognito", admins)).toBe(false);
  });

  it("promotes a social sign-up whose provider verified the address", () => {
    expect(adminOnSignUp({ email: "OWNER@example.com", emailVerified: true }, "/callback/github", admins)).toBe(true);
    expect(adminOnSignUp({ email: "owner@example.com", emailVerified: true }, "/one-tap/callback", admins)).toBe(true);
  });

  it("never promotes through SSO or SCIM", () => {
    expect(adminOnSignUp({ email: "owner@example.com", emailVerified: true }, "/sso/callback/acme", admins)).toBe(false);
    expect(adminOnSignUp({ email: "owner@example.com", emailVerified: true }, "/sso/saml2/sp/acs/acme", admins)).toBe(false);
    expect(adminOnSignUp({ email: "owner@example.com", emailVerified: true }, "/scim/v2/Users", admins)).toBe(false);
  });

  it("ignores other addresses", () => {
    expect(adminOnSignUp({ email: "someone@example.com", emailVerified: true }, "/callback/github", admins)).toBe(false);
  });
});

describe("adminOnVerification", () => {
  const pending = { email: "owner@example.com", emailVerified: true, role: "user" };

  it("promotes once the address is proven (verification link, sign-in code)", () => {
    expect(adminOnVerification(pending, "/verify-email", admins)).toBe(true);
    expect(adminOnVerification({ ...pending, role: null }, "/sign-in/email-otp", admins)).toBe(true);
  });

  it("does nothing while the address is unverified, for other addresses, or on other updates", () => {
    expect(adminOnVerification({ ...pending, emailVerified: false }, "/verify-email", admins)).toBe(false);
    expect(adminOnVerification({ ...pending, email: "someone@example.com" }, "/verify-email", admins)).toBe(false);
    expect(adminOnVerification(pending, "/update-user", admins)).toBe(false);
    expect(adminOnVerification(pending, "/admin/set-role", admins)).toBe(false);
    expect(adminOnVerification(pending, undefined, admins)).toBe(false);
  });

  it("leaves admins alone", () => {
    expect(adminOnVerification({ ...pending, role: "admin" }, "/verify-email", admins)).toBe(false);
  });
});
