import { describe, expect, it } from "vitest";

import { RECENT_SIGN_IN_SECONDS, recentSignInSecondsLeft, signedInRecently } from "@ostiary/core/lib/recent-sign-in";

describe("signedInRecently", () => {
  const now = Date.parse("2026-01-01T12:00:00Z");

  it("accepts a session created within the window, edge included", () => {
    expect(signedInRecently(new Date(now - 60_000), now)).toBe(true);
    expect(signedInRecently(new Date(now - RECENT_SIGN_IN_SECONDS * 1000), now)).toBe(true);
  });

  it("refuses an older session, and takes ISO strings", () => {
    expect(signedInRecently(new Date(now - RECENT_SIGN_IN_SECONDS * 1000 - 1), now)).toBe(false);
    expect(signedInRecently("2026-01-01T11:00:00Z", now)).toBe(false);
  });

  it("counts the seconds left, never below zero", () => {
    expect(recentSignInSecondsLeft(new Date(now - 60_000), now)).toBe(RECENT_SIGN_IN_SECONDS - 60);
    expect(recentSignInSecondsLeft(new Date(now - 3_600_000), now)).toBe(0);
  });
});
