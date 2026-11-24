import { adminJsonRoute } from "@/lib/admin-json-route";
import { previousSecretExpiries } from "@/lib/oauth-client-admin.service";

/** The apps whose previous client secret still works after a rotation, and until when (ISO dates). */
export const GET = adminJsonRoute({}, async () => ({ data: await previousSecretExpiries() }));
