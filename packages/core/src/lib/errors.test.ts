import { describe, expect, it } from "vitest";
import { ZodError, z } from "zod";

import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  PayloadTooLargeError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
  handleError,
} from "@ostiary/core/lib/errors";

describe("handleError", () => {
  it("maps ValidationError to 400", () => {
    const r = handleError(new ValidationError("bad"));
    expect(r).toEqual({ message: "bad", statusCode: 400 });
  });

  it("maps BadRequestError to 400", () => {
    const r = handleError(new BadRequestError("nope"));
    expect(r).toEqual({ message: "nope", statusCode: 400 });
  });

  it("maps NotFoundError to 404", () => {
    const r = handleError(new NotFoundError("missing"));
    expect(r).toEqual({ message: "missing", statusCode: 404 });
  });

  it("maps ConflictError to 409", () => {
    const r = handleError(new ConflictError("dup"));
    expect(r).toEqual({ message: "dup", statusCode: 409 });
  });

  it("maps UnauthorizedError to 401", () => {
    const r = handleError(new UnauthorizedError());
    expect(r).toEqual({ message: "Unauthorized", statusCode: 401 });
  });

  it("maps ForbiddenError to 403", () => {
    const r = handleError(new ForbiddenError());
    expect(r).toEqual({ message: "Forbidden", statusCode: 403 });
  });

  it("maps PayloadTooLargeError to 413", () => {
    const r = handleError(new PayloadTooLargeError());
    expect(r).toEqual({ message: "Payload too large", statusCode: 413 });
  });

  it("maps TooManyRequestsError to 429", () => {
    const r = handleError(new TooManyRequestsError());
    expect(r).toEqual({ message: "Too many requests", statusCode: 429 });
  });

  it("maps ZodError to 400", () => {
    const err = z.object({ a: z.string() }).safeParse({}).error;
    expect(err).toBeDefined();
    const r = handleError(err as ZodError);
    expect(r.statusCode).toBe(400);
    expect(r.message.length).toBeGreaterThan(0);
  });

  it("maps unknown to 500", () => {
    const r = handleError(new Error("internal"));
    expect(r).toEqual({ message: "An error occurred", statusCode: 500 });
  });
});
