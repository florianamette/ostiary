# Webhooks

Apps can be told when users change instead of polling. In the admin console, **Webhooks** > **Add an endpoint**: an HTTPS URL and the events to send. Copy the signing secret it shows (once; **Regenerate secret** makes a new one, and for 24 hours deliveries are signed with both).

Events: `user.created`, `user.updated` (name, email, email verification, username, picture), `user.deleted`, `user.banned`, `user.unbanned` (SCIM deactivation and reactivation count, with `"source": "scim"`), `user.role_changed`, `organization.member.added`, `organization.member.removed`, `organization.member.role_changed`. **Send test event** sends a `webhook.test`.

Each delivery is a `POST` with a JSON body and the [Standard Webhooks](https://www.standardwebhooks.com/) headers `webhook-id` (the event id, the same on every retry: use it to ignore duplicates), `webhook-timestamp` and `webhook-signature`:

```json
{
  "id": "evt_570736d750ed4c4596883d04c30e23d1",
  "type": "user.role_changed",
  "timestamp": "2026-10-08T15:52:24.067Z",
  "data": {
    "user": { "id": "iMRp...", "email": "bob@example.com", "emailVerified": true, "name": "Bob", "username": "bob", "image": null, "role": "admin", "banned": false },
    "previousRole": "user"
  }
}
```

Payloads carry ids, email, name, role and organization only: never passwords, tokens, two-factor secrets or ban reasons. Membership events carry `data.member` (`id`, `organizationId`, `userId`, `role`).

Verify the signature on the raw body before trusting it (any Standard Webhooks library works too, e.g. the `standardwebhooks` npm package):

```js
import { createHmac, timingSafeEqual } from "node:crypto";

// secret: "whsec_..." from the admin console. body: the raw request body (a string).
function verifyOstiaryWebhook(secret, headers, body) {
  const id = headers["webhook-id"];
  const timestamp = headers["webhook-timestamp"];
  const signatures = headers["webhook-signature"] ?? "";
  if (!id || !timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const expected = Buffer.from(`v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`);
  return signatures.split(" ").some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), expected));
}
```

Answer with any 2xx within 10 seconds. Redirects are not followed. A failed delivery is retried 4 times (after 5 minutes, 1 hour, 6 hours and 18 hours) and then marked failed; an endpoint that fails 15 times in a row is disabled, which the console shows. Each endpoint has a **Delivery log** (status, response code, attempts, next retry, the start of the answer) with **Redeliver**. Endpoint changes are in the audit log.

Delivery starts right after the request that caused the event, without slowing it down. Retries are sent by `GET /api/cron/webhooks` on the auth app, which needs `CRON_SECRET` (Vercel Cron sends it as `Authorization: Bearer $CRON_SECRET`). `apps/auth/vercel.json` runs it once a day because **Vercel Hobby only allows daily cron jobs**; on Pro, set the schedule to `*/5 * * * *`, or call the route from any other scheduler with the same header. Instances also retry due deliveries on their own, at most once a minute, whenever they send an event.

Endpoint URLs must use HTTPS and resolve to public addresses only: private, loopback, link-local and cloud metadata addresses are refused when saving and again before each delivery (the connection is pinned to the checked addresses). For local development, `WEBHOOKS_ALLOW_LOCALHOST=true` also accepts `http://localhost` (ignored in production).
