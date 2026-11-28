import { describe, expect, it } from "vitest";

import { applyAuthPolicy, DEFAULT_AUTH_POLICY, parseAuthPolicy, policySessionExpiry, type PolicyContext } from "@ostiary/core/lib/auth-policy";

const DAY = 86_400;
const now = new Date("2026-11-24T12:00:00Z");
const inDays = (days: number) => new Date(now.getTime() + days * DAY * 1000);

function context(): PolicyContext {
  return {
    sessionConfig: { expiresIn: 7 * DAY, updateAge: DAY },
    password: { config: { minPasswordLength: 8 } },
    options: { emailAndPassword: { disableSignUp: false } },
  };
}

describe("parseAuthPolicy", () => {
  it("falls back to Better Auth's defaults field by field", () => {
    expect(parseAuthPolicy(undefined)).toEqual(DEFAULT_AUTH_POLICY);
    expect(parseAuthPolicy({ sessionDays: 30, minPasswordLength: 9, passwordSignUp: false, extendSessions: "no" })).toEqual({
      ...DEFAULT_AUTH_POLICY,
      sessionDays: 30,
      passwordSignUp: false,
    });
  });

  it("takes only the offered inactive account choices", () => {
    expect(parseAuthPolicy({ inactiveDays: 365, inactiveAction: "delete", inactiveSince: "2027-01-01T00:00:00.000Z" })).toMatchObject({
      inactiveDays: 365,
      inactiveAction: "delete",
      inactiveSince: "2027-01-01T00:00:00.000Z",
    });
    expect(parseAuthPolicy({ inactiveDays: 30, inactiveAction: "archive", inactiveSince: "soon" })).toMatchObject({
      inactiveDays: 0,
      inactiveAction: "disable",
      inactiveSince: null,
    });
  });
});

describe("applyAuthPolicy", () => {
  it("writes the lifetime, refresh age, password length and sign-up into Better Auth's context", () => {
    const ctx = context();
    applyAuthPolicy(ctx, { ...DEFAULT_AUTH_POLICY, sessionDays: 30, minPasswordLength: 12, passwordSignUp: false });
    expect(ctx).toEqual({
      sessionConfig: { expiresIn: 30 * DAY, updateAge: DAY },
      password: { config: { minPasswordLength: 12 } },
      options: { emailAndPassword: { disableSignUp: true } },
    });
  });

  it("never refreshes a session when sessions are not extended", () => {
    const ctx = context();
    applyAuthPolicy(ctx, { ...DEFAULT_AUTH_POLICY, sessionDays: 1, extendSessions: false });
    expect(ctx.sessionConfig.updateAge).toBeGreaterThan(ctx.sessionConfig.expiresIn);
  });
});

describe("policySessionExpiry", () => {
  it("gives a new session the policy's lifetime", () => {
    expect(policySessionExpiry(inDays(7), { ...DEFAULT_AUTH_POLICY, sessionDays: 30 }, now)).toEqual(inDays(30));
    expect(policySessionExpiry(inDays(7), { ...DEFAULT_AUTH_POLICY, sessionDays: 1 }, now)).toEqual(inDays(1));
  });

  it("keeps a session without remember me at a day or less", () => {
    expect(policySessionExpiry(inDays(1), { ...DEFAULT_AUTH_POLICY, sessionDays: 30 }, now)).toEqual(inDays(1));
  });
});
