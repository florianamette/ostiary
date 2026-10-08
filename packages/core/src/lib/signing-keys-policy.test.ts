import type { JwtOptions } from "better-auth/plugins";
import { describe, expect, it } from "vitest";

import {
  applySigningKeySettings,
  DEFAULT_SIGNING_KEY_SETTINGS,
  describeSigningKeys,
  liveKeyExpiry,
  parseSigningKeySettings,
  type SigningKeyRow,
} from "@ostiary/core/lib/signing-keys-policy";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-08T12:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);

describe("parseSigningKeySettings", () => {
  it("keeps rotation off when nothing is stored", () => {
    expect(parseSigningKeySettings(undefined)).toEqual(DEFAULT_SIGNING_KEY_SETTINGS);
    expect(parseSigningKeySettings(null).rotationIntervalDays).toBe(0);
    expect(parseSigningKeySettings("90").rotationIntervalDays).toBe(0);
    expect(DEFAULT_SIGNING_KEY_SETTINGS.gracePeriodDays).toBe(30);
  });

  it("reads valid values and falls back field by field", () => {
    expect(parseSigningKeySettings({ rotationIntervalDays: 90, gracePeriodDays: 7 })).toEqual({
      rotationIntervalDays: 90,
      gracePeriodDays: 7,
    });
    expect(parseSigningKeySettings({ rotationIntervalDays: -1, gracePeriodDays: 0 })).toEqual(DEFAULT_SIGNING_KEY_SETTINGS);
    expect(parseSigningKeySettings({ rotationIntervalDays: 1.5, gracePeriodDays: "7" })).toEqual(DEFAULT_SIGNING_KEY_SETTINGS);
    expect(parseSigningKeySettings({ rotationIntervalDays: 30 }).gracePeriodDays).toBe(30);
  });
});

describe("applySigningKeySettings", () => {
  it("writes seconds into the jwt plugin options, and no interval when rotation is off", () => {
    const options: JwtOptions = {};
    applySigningKeySettings(options, { rotationIntervalDays: 90, gracePeriodDays: 7 });
    expect(options.jwks).toEqual({ rotationInterval: 90 * 86400, gracePeriod: 7 * 86400 });
    applySigningKeySettings(options, { rotationIntervalDays: 0, gracePeriodDays: 30 });
    expect(options.jwks?.rotationInterval).toBeUndefined();
    expect(options.jwks?.gracePeriod).toBe(30 * 86400);
  });

  it("keeps the other jwks options", () => {
    const options: JwtOptions = { jwks: { jwksPath: "/jwks" } };
    applySigningKeySettings(options, DEFAULT_SIGNING_KEY_SETTINGS);
    expect(options.jwks?.jwksPath).toBe("/jwks");
  });
});

describe("liveKeyExpiry", () => {
  it("is created + interval", () => {
    expect(liveKeyExpiry(daysAgo(10), { rotationIntervalDays: 30, gracePeriodDays: 30 }, now)).toEqual(
      new Date(now.getTime() + 20 * DAY),
    );
  });

  it("is never in the past, so a key older than the interval keeps its grace period", () => {
    expect(liveKeyExpiry(daysAgo(200), { rotationIntervalDays: 30, gracePeriodDays: 30 }, now)).toEqual(now);
  });

  it("is none when rotation is off", () => {
    expect(liveKeyExpiry(daysAgo(200), { rotationIntervalDays: 0, gracePeriodDays: 30 }, now)).toBeNull();
  });
});

describe("describeSigningKeys", () => {
  const settings = { rotationIntervalDays: 90, gracePeriodDays: 30 };
  const key = (id: string, created: number, expires: number | null, alg: string | null = "EdDSA"): SigningKeyRow => ({
    id,
    alg,
    crv: "Ed25519",
    createdAt: daysAgo(created),
    expiresAt: expires === null ? null : daysAgo(expires),
  });

  it("marks the newest live key current, retired keys published during the grace period, then expired", () => {
    const keys = describeSigningKeys(
      [key("old", 300, 200), key("recent", 100, 10), key("new", 10, -80)],
      settings,
      now,
    );
    expect(keys.map((k) => [k.id, k.status])).toEqual([
      ["new", "current"],
      ["recent", "published"],
      ["old", "expired"],
    ]);
    expect(keys[1]!.unpublishedAt).toEqual(new Date(now.getTime() + 20 * DAY));
  });

  it("treats keys without an expiry as live, and a legacy key without alg as EdDSA", () => {
    const keys = describeSigningKeys([key("legacy", 400, null, null)], settings, now);
    expect(keys[0]).toMatchObject({ id: "legacy", alg: "EdDSA", status: "current", unpublishedAt: null });
  });

  it("shows a spare live key (two instances rotating at once) as published", () => {
    const keys = describeSigningKeys([key("a", 1, null), key("b", 2, null)], settings, now);
    expect(keys.map((k) => k.status)).toEqual(["current", "published"]);
  });

  it("has no current key when every key has expired (the next token creates one)", () => {
    const keys = describeSigningKeys([key("a", 100, 1)], settings, now);
    expect(keys[0]!.status).toBe("published");
  });
});
