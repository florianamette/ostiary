import { createHash, timingSafeEqual } from "node:crypto";

import { env } from "@ostiary/core/lib/env";
import { processDueDeliveries } from "@ostiary/core/lib/webhooks/outbox";

/*
 * Retries webhook deliveries that are due, then deletes deliveries older than 30 days.
 * Called by Vercel Cron (apps/auth/vercel.json), which sends `Authorization: Bearer
 * $CRON_SECRET`; any other scheduler can call it the same way. Without CRON_SECRET it refuses.
 */

export const dynamic = "force-dynamic";
// Room for a batch of 10-second deliveries; processDueDeliveries stops taking new ones at 45 s.
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  // Compare digests: equal lengths, and no timing hint about the secret.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const counts = await processDueDeliveries();
  return Response.json(counts);
}
