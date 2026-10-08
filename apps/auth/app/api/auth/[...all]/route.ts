import { auth } from "@/lib/auth";
import { withRateLimitHeaders } from "@ostiary/core/lib/rate-limit";
import { toNextJsHandler } from "better-auth/next-js";

// PUT, PATCH and DELETE are for SCIM provisioning (/api/auth/scim/v2/Users/:id and /Groups/:id).
// A rate-limited request gets a standard Retry-After header and its wait in the body.
export const { GET, POST, PUT, PATCH, DELETE } = withRateLimitHeaders(toNextJsHandler(auth));
