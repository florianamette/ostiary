import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";

import { betterAuthErrorMessage, betterAuthErrorStatus } from "@ostiary/core/lib/api/better-auth-error";

describe("betterAuthErrorMessage", () => {
  it("uses the body of a client error", () => {
    expect(betterAuthErrorMessage(new APIError("BAD_REQUEST", { message: "Invalid domain" }), "fallback")).toBe("Invalid domain");
    expect(
      betterAuthErrorMessage(new APIError("BAD_REQUEST", { error: "invalid_request", error_description: "bad scope" }), "fallback"),
    ).toBe("bad scope");
  });

  it("hides server errors and errors that are not Better Auth's", () => {
    expect(betterAuthErrorMessage(new APIError("INTERNAL_SERVER_ERROR", { message: "boom" }), "fallback")).toBe("fallback");
    expect(betterAuthErrorMessage(new Error('Failed query: select * from "user"'), "fallback")).toBe("fallback");
    expect(betterAuthErrorMessage(null, "fallback")).toBe("fallback");
  });

  it("falls back on an empty body", () => {
    expect(betterAuthErrorMessage(new APIError("NOT_FOUND"), "fallback")).toBe("fallback");
  });
});

describe("betterAuthErrorStatus", () => {
  it("reads APIError's status code", () => {
    expect(betterAuthErrorStatus(new APIError("FORBIDDEN"))).toBe(403);
    expect(betterAuthErrorStatus({ status: 404 })).toBe(404);
    expect(betterAuthErrorStatus(new Error("x"))).toBeUndefined();
  });
});
