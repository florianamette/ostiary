import { ZodError } from "zod";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

export class ForbiddenError extends Error {
  constructor(message: string = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
    Object.setPrototypeOf(this, BadRequestError.prototype);
  }
}

export class PayloadTooLargeError extends Error {
  constructor(message: string = "Payload too large") {
    super(message);
    this.name = "PayloadTooLargeError";
    Object.setPrototypeOf(this, PayloadTooLargeError.prototype);
  }
}

export class TooManyRequestsError extends Error {
  constructor(message: string = "Too many requests") {
    super(message);
    this.name = "TooManyRequestsError";
    Object.setPrototypeOf(this, TooManyRequestsError.prototype);
  }
}

function zodMessage(error: ZodError): string {
  const first = error.errors[0];
  return first ? `${first.path.join(".") || "request"}: ${first.message}` : "Validation failed";
}

export function handleError(error: unknown): { message: string; statusCode: number } {
  if (error instanceof ZodError) {
    return { message: zodMessage(error), statusCode: 400 };
  }

  if (error instanceof ValidationError || error instanceof BadRequestError) {
    return { message: error.message, statusCode: 400 };
  }

  if (error instanceof NotFoundError) {
    return { message: error.message, statusCode: 404 };
  }

  if (error instanceof ConflictError) {
    return { message: error.message, statusCode: 409 };
  }

  if (error instanceof UnauthorizedError) {
    return { message: error.message, statusCode: 401 };
  }

  if (error instanceof ForbiddenError) {
    return { message: error.message, statusCode: 403 };
  }

  if (error instanceof PayloadTooLargeError) {
    return { message: error.message, statusCode: 413 };
  }

  if (error instanceof TooManyRequestsError) {
    return { message: error.message, statusCode: 429 };
  }

  return {
    message: "An error occurred",
    statusCode: 500,
  };
}
