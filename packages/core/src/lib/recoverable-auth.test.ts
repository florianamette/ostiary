import { describe, expect, it, vi } from "vitest";

import { recoverableAuth } from "@ostiary/core/lib/recoverable-auth";

/** Stands in for a Better Auth instance whose start needs the database. */
function fakeAuth(databaseUp: () => boolean) {
  const $context = databaseUp()
    ? Promise.resolve({ ok: true })
    : Promise.reject(new Error("Connection terminated due to connection timeout"));
  return {
    $context,
    api: { getSession: async () => ({ ...(await $context), user: "ada" }) },
    handler: async (_request: Request) => {
      await $context;
      return new Response("ok");
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("recoverableAuth", () => {
  it("keeps one instance while it works", async () => {
    const create = vi.fn(() => fakeAuth(() => true));
    const auth = recoverableAuth(create);
    await expect(auth.api.getSession()).resolves.toMatchObject({ user: "ada" });
    await expect(auth.handler(new Request("http://localhost/api/auth/ok"))).resolves.toBeInstanceOf(Response);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("recovers once the database is back after a failed start", async () => {
    let up = false;
    let clock = 0;
    const onError = vi.fn();
    const create = vi.fn(() => fakeAuth(() => up));
    const auth = recoverableAuth(create, { retryAfterMs: 1_000, now: () => clock, onError });

    // Database down at startup: requests fail…
    await expect(auth.api.getSession()).rejects.toThrow(/connection timeout/);
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);

    // …and keep failing while it stays down, rebuilding at most once per retry interval.
    clock = 500;
    await expect(auth.handler(new Request("http://localhost/"))).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(1);
    clock = 1_000;
    await expect(auth.api.getSession()).rejects.toThrow();
    await flush();
    expect(create).toHaveBeenCalledTimes(2);

    // Database back: the next access after the interval gets a working instance, for good.
    up = true;
    clock = 2_000;
    await expect(auth.api.getSession()).resolves.toMatchObject({ user: "ada" });
    await expect(auth.handler(new Request("http://localhost/"))).resolves.toBeInstanceOf(Response);
    clock = 10_000;
    await expect(auth.api.getSession()).resolves.toMatchObject({ user: "ada" });
    expect(create).toHaveBeenCalledTimes(3);
  });

  it("handles the failed start itself (no unhandled rejection)", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      recoverableAuth(() => fakeAuth(() => false), { onError: () => {} });
      await flush();
      await flush();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("works with toNextJsHandler-style callers that check for `handler`", () => {
    const auth = recoverableAuth(() => fakeAuth(() => true));
    expect("handler" in auth).toBe(true);
    expect(typeof auth.handler).toBe("function");
  });
});
