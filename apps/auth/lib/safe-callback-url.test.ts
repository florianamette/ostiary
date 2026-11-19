import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { safeCallbackURL } from "@/lib/safe-callback-url";

describe("safeCallbackURL", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://auth.example.com");
    vi.stubEnv("NEXT_PUBLIC_ADMIN_APP_URL", "https://admin.example.com");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("keeps a path on this app", () => {
    expect(safeCallbackURL("/en/dashboard?tab=apps", "/fallback")).toBe("/en/dashboard?tab=apps");
  });

  it("keeps a page of this app or the admin app given as a URL", () => {
    expect(safeCallbackURL("https://admin.example.com/en/users", "/fallback")).toBe("https://admin.example.com/en/users");
    expect(safeCallbackURL("https://auth.example.com/en/device", "/fallback")).toMatch(/\/en\/device$/);
  });

  it("refuses other sites and tricks that look like paths", () => {
    for (const raw of [
      "https://evil.example.com/",
      "//evil.example.com",
      "/\\evil.example.com",
      "/\t/evil.example.com",
      " /en/dashboard",
      "javascript:alert(1)",
      "https://user:pass@admin.example.com/",
    ]) {
      expect(safeCallbackURL(raw, "/fallback")).toBe("/fallback");
    }
  });

  it("falls back without a value", () => {
    expect(safeCallbackURL(null, "/fallback")).toBe("/fallback");
    expect(safeCallbackURL("", "/fallback")).toBe("/fallback");
  });

  it("uses the browser's origin on the client", () => {
    vi.stubGlobal("window", { location: { origin: "https://auth.example.com" } });
    expect(safeCallbackURL("https://auth.example.com/en/dashboard", "/fallback")).toMatch(/\/en\/dashboard$/);
    expect(safeCallbackURL("https://evil.example.com/", "/fallback")).toBe("/fallback");
  });
});
