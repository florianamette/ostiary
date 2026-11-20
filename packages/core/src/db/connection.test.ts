import { describe, expect, it, vi } from "vitest";

import { connectWithRetry, isTransientConnectError, normalizeSslMode } from "./connection";

describe("normalizeSslMode", () => {
  it("writes the modes pg treats as verify-full as verify-full", () => {
    for (const mode of ["require", "prefer", "verify-ca", "REQUIRE"]) {
      expect(normalizeSslMode(`postgresql://u:p@h/db?sslmode=${mode}`)).toBe("postgresql://u:p@h/db?sslmode=verify-full");
    }
  });

  it("keeps the other parameters and the rest of the URL byte for byte", () => {
    expect(normalizeSslMode("postgres://u:p%40ss@h:5432/db?channel_binding=require&sslmode=require&x=1")).toBe(
      "postgres://u:p%40ss@h:5432/db?channel_binding=require&sslmode=verify-full&x=1",
    );
  });

  it("leaves disable, no-verify, verify-full and URLs without sslmode alone", () => {
    for (const url of [
      "postgresql://u:p@h/db",
      "postgresql://u:p@h/db?sslmode=disable",
      "postgresql://u:p@h/db?sslmode=no-verify",
      "postgresql://u:p@h/db?sslmode=verify-full",
    ]) {
      expect(normalizeSslMode(url)).toBe(url);
    }
  });

  it("leaves libpq-compatible URLs alone: there require means no certificate check", () => {
    const url = "postgresql://u:p@h/db?uselibpqcompat=true&sslmode=require";
    expect(normalizeSslMode(url)).toBe(url);
  });
});

describe("isTransientConnectError", () => {
  it("retries timeouts, dropped connections and a server starting up", () => {
    expect(isTransientConnectError(new Error("Connection terminated due to connection timeout"))).toBe(true);
    expect(isTransientConnectError(Object.assign(new Error("connect"), { code: "ECONNREFUSED" }))).toBe(true);
    expect(isTransientConnectError(Object.assign(new Error("starting"), { code: "57P03" }))).toBe(true);
    expect(isTransientConnectError(new Error("wrapped", { cause: Object.assign(new Error("x"), { code: "ECONNRESET" }) }))).toBe(true);
  });

  it("does not retry bad credentials, a full pool or an ended pool", () => {
    expect(isTransientConnectError(Object.assign(new Error("password authentication failed"), { code: "28P01" }))).toBe(false);
    expect(isTransientConnectError(new Error("timeout exceeded when trying to connect"))).toBe(false);
    expect(isTransientConnectError(new Error("Cannot use a pool after calling end on the pool"))).toBe(false);
    expect(isTransientConnectError("nope")).toBe(false);
  });
});

describe("connectWithRetry", () => {
  const transient = () => new Error("Connection terminated unexpectedly");
  const quiet = { sleep: async () => {}, onRetry: () => {} };

  it("returns once an attempt succeeds", async () => {
    const connect = vi.fn().mockRejectedValueOnce(transient()).mockResolvedValueOnce("client");
    await expect(connectWithRetry(connect, quiet)).resolves.toBe("client");
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("stops after the last attempt", async () => {
    const connect = vi.fn().mockRejectedValue(transient());
    await expect(connectWithRetry(connect, { ...quiet, attempts: 3 })).rejects.toThrow("terminated");
    expect(connect).toHaveBeenCalledTimes(3);
  });

  it("does not retry other errors", async () => {
    const connect = vi.fn().mockRejectedValue(new Error("password authentication failed"));
    await expect(connectWithRetry(connect, quiet)).rejects.toThrow("password");
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("stops once the time budget is spent", async () => {
    let t = 0;
    const connect = vi.fn().mockImplementation(async () => {
      t += 10_000; // an attempt that hangs until the connection timeout
      throw transient();
    });
    await expect(connectWithRetry(connect, { ...quiet, now: () => t, budgetMs: 12_000 })).rejects.toThrow();
    expect(connect).toHaveBeenCalledTimes(2);
  });
});
