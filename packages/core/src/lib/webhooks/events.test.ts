import { describe, expect, it } from "vitest";

import { SCIM_DEACTIVATED_REASON } from "@ostiary/core/lib/scim";
import { memberRoleEvents, userSnapshot, userUpdateEvents } from "@ostiary/core/lib/webhooks/events";
import { nextRetryDelay, MAX_ATTEMPTS } from "@ostiary/core/lib/webhooks/outbox";

const user = {
  id: "u1",
  name: "Ada",
  email: "ada@example.com",
  emailVerified: true,
  image: null,
  role: "user",
  banned: false,
  banReason: null,
  banExpires: null,
  username: "ada",
  displayUsername: "ada",
  twoFactorEnabled: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const types = (events: { type: string }[]) => events.map((e) => e.type);

describe("webhook events", () => {
  it("copies only the safe fields of a user", () => {
    const snapshot = userSnapshot({ ...user, password: "hash", twoFactorSecret: "s", banReason: "note" });
    expect(Object.keys(snapshot).sort()).toEqual(["banned", "email", "emailVerified", "id", "image", "name", "role", "username"]);
  });

  it("ignores updates that change nothing tracked", () => {
    expect(userUpdateEvents(user, { ...user, updatedAt: new Date(), twoFactorEnabled: false })).toEqual([]);
  });

  it("reports profile changes with the changed field names", () => {
    const [event] = userUpdateEvents(user, { ...user, email: "new@example.com", emailVerified: false });
    expect(event?.type).toBe("user.updated");
    expect(event?.data.changes).toEqual(["email", "emailVerified"]);
    expect(event?.id).toMatch(/^evt_[0-9a-f]{32}$/);
  });

  it("reports role changes with the previous role", () => {
    const events = userUpdateEvents(user, { ...user, role: "admin" });
    expect(types(events)).toEqual(["user.role_changed"]);
    expect(events[0]?.data.previousRole).toBe("user");
  });

  it("reports bans and unbans, telling SCIM from admins, without the reason", () => {
    const banned = { ...user, banned: true, banReason: "private note", banExpires: new Date("2030-01-01T00:00:00Z") };
    const [ban] = userUpdateEvents(user, banned);
    expect(ban?.type).toBe("user.banned");
    expect(ban?.data).toMatchObject({ source: "admin", expiresAt: "2030-01-01T00:00:00.000Z" });
    expect(JSON.stringify(ban)).not.toContain("private note");
    expect(types(userUpdateEvents(banned, { ...banned, banned: false }))).toEqual(["user.unbanned"]);

    const scim = { ...user, banned: true, banReason: SCIM_DEACTIVATED_REASON };
    expect(userUpdateEvents(user, scim)[0]?.data.source).toBe("scim");
    expect(userUpdateEvents(scim, { ...user })[0]?.data.source).toBe("scim");
  });

  it("reports member role changes only when the role changes", () => {
    const member = { id: "m1", organizationId: "o1", userId: "u1", role: "member" };
    expect(memberRoleEvents(member, { ...member })).toEqual([]);
    const [event] = memberRoleEvents(member, { ...member, role: "admin" });
    expect(event).toMatchObject({ type: "organization.member.role_changed", data: { previousRole: "member", member: { role: "admin" } } });
  });
});

describe("retry schedule", () => {
  it("tries 5 times over about a day, then stops", () => {
    expect(MAX_ATTEMPTS).toBe(5);
    const delays = [1, 2, 3, 4].map((n) => nextRetryDelay(n)!);
    expect(delays.every((d, i) => i === 0 || d > delays[i - 1]!)).toBe(true);
    const total = delays.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(20 * 3_600_000);
    expect(total).toBeLessThan(30 * 3_600_000);
    expect(nextRetryDelay(5)).toBeNull();
  });
});
