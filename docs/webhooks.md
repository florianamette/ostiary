# Webhooks

Get a signed HTTPS request in your app when users, roles or organization memberships change in Ostiary, instead of polling for changes.

Each delivery is a `POST` with a JSON event, signed with the [Standard Webhooks](https://www.standardwebhooks.com/) scheme, retried for about a day when your endpoint fails.

## Add an endpoint

1. In the admin console, open **Webhooks**.
2. Under **Add an endpoint**, enter the **URL** (HTTPS, on a public address), an optional description, and tick the **Events** to send.
3. Click **Add endpoint**.
4. Copy the **Signing secret** (`whsec_...`) into your app: it is shown only once.
5. Click **Send test event** on the endpoint to check that your app answers.

You can have up to 50 endpoints. Endpoint changes are in the audit log (**Added webhook endpoint**, **Updated webhook endpoint**, and so on).

### URL rules

Endpoint URLs must use HTTPS and resolve to public addresses only. Private, loopback, link-local and cloud metadata addresses are refused when you save and again before each delivery, and the connection is pinned to the addresses that were checked, so a DNS answer that changes in between cannot slip through. URLs with a user name, password or `#fragment` are refused.

For local development, `WEBHOOKS_ALLOW_LOCALHOST=true` also accepts `http://localhost` and other loopback addresses. It is ignored in production. Private ranges stay refused even then.

## Events

| Event | Sent when | `data` |
| --- | --- | --- |
| `user.created` | An account is created (sign-up, admin, SSO, SCIM). Not for accounts brought in by a [user import](import-users.md) | `user` |
| `user.updated` | Name, email, email verification, username or picture changes | `user`, `changes` |
| `user.deleted` | An account is deleted | `user` (its last state) |
| `user.banned` | An account is banned, or deactivated by SCIM | `user`, `source`, `expiresAt` |
| `user.unbanned` | A ban is lifted, or SCIM reactivates the account | `user`, `source` |
| `user.role_changed` | An account's platform role changes | `user`, `previousRole` |
| `organization.member.added` | Someone joins an organization | `member` |
| `organization.member.removed` | Someone leaves or is removed from an organization, or their account is deleted | `member` |
| `organization.member.role_changed` | A member's role in an organization changes | `member`, `previousRole` |
| `webhook.test` | **Send test event** is clicked (not subscribable) | `message` |

Joining the default Public workspace (every new account does) sends no `organization.member.added` event, and deleting an account sends no `organization.member.removed` for it.

Payloads carry IDs, email, name, username, picture, role and organization only: never passwords, tokens, two-factor secrets or ban reasons. A change that is rolled back sends nothing: events are recorded once the change is committed.

### Event fields

Every event has the same envelope:

| Field | Value |
| --- | --- |
| `id` | The event ID (`evt_` and 32 hex characters), also in the `webhook-id` header |
| `type` | The event type |
| `timestamp` | When it happened (ISO 8601) |
| `data` | The event's data, below |

`data.user` is a snapshot of the account:

| Field | Value |
| --- | --- |
| `id` | User ID |
| `email` | Email address |
| `emailVerified` | `true` or `false` |
| `name` | Display name |
| `username` | Username, or `null` |
| `image` | Picture URL, or `null` |
| `role` | Platform role (`user`, `admin`) |
| `banned` | `true` or `false` |

`data.member` is a membership: `id` (membership ID), `organizationId`, `userId` and `role` (`owner`, `admin`, `member`).

Other fields:

- `changes` (`user.updated`): the fields that changed, among `name`, `email`, `emailVerified`, `username` and `image`.
- `previousRole` (`user.role_changed`, `organization.member.role_changed`): the role before the change.
- `source` (`user.banned`, `user.unbanned`): `"admin"` or `"scim"`, who banned or unbanned the account.
- `expiresAt` (`user.banned`): when the ban ends, or `null` for a permanent ban.

### Payload examples

`user.created`:

```json
{
  "id": "evt_4b0e8c1f2a9d4e6b8c7a5f3e2d1c0b9a",
  "type": "user.created",
  "timestamp": "2026-10-08T15:40:02.118Z",
  "data": {
    "user": {
      "id": "iMRpZ3x0eV5mTqQh2wJ8",
      "email": "bob@example.com",
      "emailVerified": false,
      "name": "Bob",
      "username": "bob",
      "image": null,
      "role": "user",
      "banned": false
    }
  }
}
```

`user.updated`:

```json
{
  "id": "evt_9f1d2c3b4a5e6f708192a3b4c5d6e7f8",
  "type": "user.updated",
  "timestamp": "2026-10-08T15:45:10.504Z",
  "data": {
    "user": { "id": "iMRpZ3x0eV5mTqQh2wJ8", "email": "bob@example.com", "emailVerified": true, "name": "Bob Smith", "username": "bob", "image": null, "role": "user", "banned": false },
    "changes": ["name", "emailVerified"]
  }
}
```

`user.role_changed`:

```json
{
  "id": "evt_570736d750ed4c4596883d04c30e23d1",
  "type": "user.role_changed",
  "timestamp": "2026-10-08T15:52:24.067Z",
  "data": {
    "user": { "id": "iMRpZ3x0eV5mTqQh2wJ8", "email": "bob@example.com", "emailVerified": true, "name": "Bob Smith", "username": "bob", "image": null, "role": "admin", "banned": false },
    "previousRole": "user"
  }
}
```

`user.banned` (deactivated by SCIM):

```json
{
  "id": "evt_0a1b2c3d4e5f60718293a4b5c6d7e8f9",
  "type": "user.banned",
  "timestamp": "2026-10-09T08:00:00.000Z",
  "data": {
    "user": { "id": "iMRpZ3x0eV5mTqQh2wJ8", "email": "bob@example.com", "emailVerified": true, "name": "Bob Smith", "username": "bob", "image": null, "role": "user", "banned": true },
    "source": "scim",
    "expiresAt": null
  }
}
```

`organization.member.role_changed`:

```json
{
  "id": "evt_c3d4e5f60718293a4b5c6d7e8f90a1b2",
  "type": "organization.member.role_changed",
  "timestamp": "2026-10-09T09:12:45.331Z",
  "data": {
    "member": { "id": "mbr_Hq3Zt8Lk", "organizationId": "org_8Kq2", "userId": "iMRpZ3x0eV5mTqQh2wJ8", "role": "admin" },
    "previousRole": "member"
  }
}
```

`webhook.test`:

```json
{
  "id": "evt_1e2d3c4b5a6978877665544332211000",
  "type": "webhook.test",
  "timestamp": "2026-10-09T10:00:00.000Z",
  "data": { "message": "Test event from Ostiary. It changes nothing." }
}
```

## Verify the signature

Each delivery carries three headers:

| Header | Value |
| --- | --- |
| `webhook-id` | The event ID. The same on every retry: use it to ignore duplicates |
| `webhook-timestamp` | When this attempt was sent, in Unix seconds |
| `webhook-signature` | `v1,` and the base64 HMAC-SHA256 of `<id>.<timestamp>.<body>`, keyed with the bytes encoded after `whsec_` in the secret. Several signatures are separated by spaces |

The requests also have `content-type: application/json` and `user-agent: Ostiary-Webhooks/1.0`.

Verify the signature on the **raw** request body, before parsing it, and reject timestamps more than 5 minutes away from your clock. In a Next.js route handler (or any runtime with `Request` and `node:crypto`):

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.OSTIARY_WEBHOOK_SECRET!; // "whsec_..."
const TOLERANCE_SECONDS = 5 * 60;

function verifyOstiaryWebhook(secret: string, headers: Headers, body: string): boolean {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatures = headers.get("webhook-signature");
  if (!id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const digest = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  const expected = Buffer.from(`v1,${digest}`);
  return signatures.split(" ").some((candidate) => {
    const given = Buffer.from(candidate);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export async function POST(request: Request) {
  const body = await request.text(); // the raw body, not request.json()
  if (!verifyOstiaryWebhook(SECRET, request.headers, body)) {
    return new Response("invalid signature", { status: 401 });
  }
  const event = JSON.parse(body) as { id: string; type: string; data: Record<string, unknown> };

  // Ignore an event you already processed (retries and redeliveries reuse its id).
  // if (await alreadyProcessed(event.id)) return new Response(null, { status: 204 });

  switch (event.type) {
    case "user.deleted":
      // remove the user's data in your app
      break;
    case "user.role_changed":
      // update the role you cached
      break;
  }
  return new Response(null, { status: 204 });
}
```

Any Standard Webhooks library works too, for example the `standardwebhooks` npm package:

```ts
import { Webhook } from "standardwebhooks";

const wh = new Webhook(process.env.OSTIARY_WEBHOOK_SECRET!); // accepts the whsec_ prefix

export async function POST(request: Request) {
  const body = await request.text();
  try {
    const event = wh.verify(body, Object.fromEntries(request.headers)) as { id: string; type: string };
    // handle event
    return new Response(null, { status: 204 });
  } catch {
    return new Response("invalid signature", { status: 401 });
  }
}
```

## Answer a delivery

- Answer with any `2xx` within 10 seconds. Anything else counts as a failure, including a redirect (redirects are not followed) and no answer in time.
- Do the slow work after answering, for example in a queue.
- Deliveries can arrive more than once and out of order. Use `webhook-id` (the event `id`) to ignore duplicates, and `timestamp` to order events about the same user.

## Retries and failures

A failed delivery is retried 4 times, after 5 minutes, 1 hour, 6 hours and 18 hours, then marked **Failed**. A test event is sent once and never retried.

An endpoint that fails 15 times in a row (all events together) is disabled, which the console shows as **Disabled after repeated failures**. Disabling an endpoint, automatically or by an admin, gives up the deliveries still waiting for it, and turning it back on does not send them either: a re-enabled endpoint, maybe with a new URL, never receives old events. Those deliveries show as **Failed** in the **Delivery log**, with the answer *Not sent: the endpoint was disabled.* Use **Redeliver** in the log for the events you need once the endpoint is back on.

### How retries run

Delivery starts right after the request that caused the event, without slowing it down. Retries are sent by `GET /api/cron/webhooks` on the auth app, which needs `CRON_SECRET` and the header `Authorization: Bearer $CRON_SECRET`; without `CRON_SECRET` the route answers `401`. The same route deletes deliveries older than 30 days.

- On Vercel, Vercel Cron sends that header. `apps/auth/vercel.json` runs the route once a day (`0 4 * * *`) because **Vercel Hobby only allows daily cron jobs**. On Pro, set the schedule to `*/5 * * * *` so retries go out on time.
- Elsewhere, call the route from any scheduler with the same header, for example every 5 minutes:

  ```bash
  curl -fsS https://auth.example.com/api/cron/webhooks -H "Authorization: Bearer $CRON_SECRET"
  ```

Instances also retry due deliveries on their own, at most once a minute, whenever they send an event. See [Self-hosting](self-hosting.md) for scheduling housekeeping.

## Check deliveries

Each endpoint shows its last success and failure, failures in a row, and how many deliveries are waiting or failed. Its **Delivery log** lists the latest deliveries: event, status (**Delivered**, **Pending**, **Failed**), response code, attempts, next retry and the start of your endpoint's answer. Deliveries are kept 30 days.

**Redeliver** sends the same event (same `webhook-id`) again now, with a fresh set of attempts. The endpoint must be enabled.

## Rotate the signing secret

1. On the endpoint, click **Regenerate secret**, then **Regenerate**.
2. Copy the new secret: it is shown only once.
3. Update your app with the new secret within 24 hours.

For 24 hours, each delivery carries two signatures in `webhook-signature`, one with the old secret and one with the new, so your app keeps verifying while you switch. The secrets are stored encrypted with `BETTER_AUTH_SECRET`: if that variable changes, deliveries fail until you regenerate the secret.

## Disable or delete an endpoint

- To pause an endpoint, edit it and untick **Enabled**. While it is disabled, new events are not recorded for it. Its pending deliveries are given up, and ticking **Enabled** again does not send them: use **Redeliver** in the **Delivery log** for the events you need.
- **Delete** stops the endpoint and deletes its delivery log and pending retries.

## Related

- [Organizations](organizations.md#get-notified-of-membership-changes)
- [SCIM provisioning](scim.md)
- [Configuration](configuration.md): `CRON_SECRET`, `WEBHOOKS_ALLOW_LOCALHOST`
- [Self-hosting](self-hosting.md)
