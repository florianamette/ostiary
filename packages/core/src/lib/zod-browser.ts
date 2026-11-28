import { config } from "zod";

/*
 * In the browser, zod never compiles validators with `new Function`: the apps' Content Security
 * Policy forbids eval in production, and zod's check for it (`Function("")`, caught) still
 * reports a CSP violation. Imported by the shared Providers, before any schema is used.
 */
if (typeof window !== "undefined") config({ jitless: true });
