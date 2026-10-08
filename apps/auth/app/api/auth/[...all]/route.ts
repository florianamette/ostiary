import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

// PUT, PATCH and DELETE are for SCIM provisioning (/api/auth/scim/v2/Users/:id and /Groups/:id).
export const { GET, POST, PUT, PATCH, DELETE } = toNextJsHandler(auth);
