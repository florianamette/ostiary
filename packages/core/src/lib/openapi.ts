/** Better Auth's openAPI plugin endpoint: the JSON schema of every auth endpoint. */
export const OPENAPI_SCHEMA_PATH = "/open-api/generate-schema";

/** The schema endpoint is served over HTTP: OPENAPI_SCHEMA_ENABLED, or on outside production. */
export function openApiSchemaEnabled(env: { OPENAPI_SCHEMA_ENABLED?: "true" | "false"; NODE_ENV: string }): boolean {
    return env.OPENAPI_SCHEMA_ENABLED ? env.OPENAPI_SCHEMA_ENABLED === "true" : env.NODE_ENV !== "production";
}
