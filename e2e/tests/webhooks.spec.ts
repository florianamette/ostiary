import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { createUser } from "../support/auth";
import { MOCK_URL } from "../support/env";
import { expect, test } from "../support/fixtures";

type Delivery = { headers: Record<string, string>; body: string };

/** The Standard Webhooks check from docs/webhooks.md. */
function verifySignature(secret: string, headers: Record<string, string>, body: string): boolean {
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const signed = `${headers["webhook-id"]}.${headers["webhook-timestamp"]}.${body}`;
  const expected = Buffer.from(`v1,${createHmac("sha256", key).update(signed).digest("base64")}`);
  return (headers["webhook-signature"] ?? "")
    .split(" ")
    .some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), expected));
}

test("webhook events are delivered, signed, to the endpoint", async ({ adminPage, api, request }) => {
  const name = `hook-${randomBytes(4).toString("hex")}`;
  const url = `${MOCK_URL}/webhooks/${name}`;

  await adminPage.goto("/en/webhooks");
  await adminPage.getByRole("textbox", { name: "URL" }).fill(url);
  await adminPage.getByRole("textbox", { name: "Description" }).fill(`e2e ${name}`);
  await adminPage.getByRole("button", { name: "Add endpoint" }).click();
  const dialog = adminPage.getByRole("dialog", { name: "Endpoint added" });
  const secret = await dialog.getByLabel("Signing secret").inputValue();
  expect(secret).toMatch(/^whsec_/);

  const user = await createUser(api, "hooked");

  let deliveries: Delivery[] = [];
  await expect
    .poll(
      async () => {
        deliveries = (await (await request.get(url)).json()) as Delivery[];
        return deliveries.some((d) => d.body.includes(user.email) && d.body.includes('"user.created"'));
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  const created = deliveries.find((d) => d.body.includes('"user.created"') && d.body.includes(user.email))!;
  expect(verifySignature(secret, created.headers, created.body)).toBe(true);
  expect(verifySignature(`whsec_${randomBytes(24).toString("base64")}`, created.headers, created.body)).toBe(false);
  const event = JSON.parse(created.body) as { id: string; type: string; data: { user: Record<string, unknown> } };
  expect(created.headers["webhook-id"]).toBe(event.id);
  expect(event.data.user).toMatchObject({ email: user.email });
  expect(created.body).not.toContain(user.password);
});
