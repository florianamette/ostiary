import { describe, expect, it, vi } from "vitest";

import { refreshingCache } from "@ostiary/core/lib/refreshing-cache";

let keys = 0;

/** A load the test resolves or rejects by hand. */
function deferredLoads<T>() {
  const pending: { resolve: (v: T) => void; reject: (e: unknown) => void }[] = [];
  const load = vi.fn(() => new Promise<T>((resolve, reject) => pending.push({ resolve, reject })));
  return { load, pending };
}

function cache<T>(load: () => Promise<T>, extra: { initial: T; fallback?: () => T }) {
  return refreshingCache({ globalKey: `__test_cache_${keys++}`, refreshMs: 60_000, load, loadError: "test load failed", ...extra });
}

describe("refreshingCache", () => {
  it("loads once, shares a load in progress, and serves the cached value until refreshMs", async () => {
    const { load, pending } = deferredLoads<number>();
    const c = cache(load, { initial: 0 });
    const a = c.get();
    const b = c.get();
    pending[0]!.resolve(1);
    expect(await a).toBe(1);
    expect(await b).toBe(1);
    expect(await c.get()).toBe(1);
    expect(load).toHaveBeenCalledOnce();
  });

  it("does not lose an invalidate() made while a load is in progress", async () => {
    const { load, pending } = deferredLoads<string>();
    const c = cache(load, { initial: "none" });
    const stale = c.get();
    // An admin saves a change while the old value is being read.
    c.invalidate();
    const fresh = c.get();
    expect(load).toHaveBeenCalledTimes(2);
    pending[0]!.resolve("before the change");
    pending[1]!.resolve("after the change");
    expect(await stale).toBe("before the change");
    expect(await fresh).toBe("after the change");
    expect(await c.get()).toBe("after the change");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("reloads on the next get() when a stale load finishes after invalidate()", async () => {
    const { load, pending } = deferredLoads<string>();
    const c = cache(load, { initial: "none" });
    const stale = c.get();
    c.invalidate();
    pending[0]!.resolve("old");
    expect(await stale).toBe("old");
    const next = c.get();
    expect(load).toHaveBeenCalledTimes(2);
    pending[1]!.resolve("new");
    expect(await next).toBe("new");
  });

  it("serves the fallback until a first load succeeds, then the last good value", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error("db down"));
    const c = cache(load, { initial: "initial", fallback: () => "fallback" });
    expect(await c.get()).toBe("fallback");
    load.mockResolvedValueOnce("loaded");
    expect(await c.get()).toBe("loaded");
    c.invalidate();
    load.mockRejectedValueOnce(new Error("db down again"));
    expect(await c.get()).toBe("loaded");
    errors.mockRestore();
  });

  it("serves initial on failure without a fallback", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = cache(() => Promise.reject(new Error("x")), { initial: 7 });
    expect(await c.get()).toBe(7);
    errors.mockRestore();
  });
});
