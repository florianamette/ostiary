import { beforeEach, describe, expect, it, vi } from "vitest";

/* EMAIL_DEDUP at account creation: which creations are checked, and how a refusal looks. */

let taken = false;
const checked: string[] = [];

vi.mock("@ostiary/core/db/index", () => ({ db: {} }));
vi.mock("@ostiary/core/lib/security/email-aliases", () => ({
  emailAliasTaken: async (_db: unknown, email: string) => {
    checked.push(email);
    return taken;
  },
}));

const { databaseHooks } = await import("@ostiary/core/lib/auth-hooks/database-hooks");
const before = databaseHooks().user.create.before as (user: unknown, context: unknown) => Promise<unknown>;

const newUser = { email: "john.doe+x@gmail.com", name: "John", emailVerified: false };

/** The APIError code the hook threw, or "ok". */
async function outcome(path: string | undefined): Promise<string> {
  try {
    await before(newUser, path === undefined ? undefined : { path });
    return "ok";
  } catch (error) {
    const e = error as { body?: { code?: string }; statusCode?: number };
    return `${e.statusCode} ${e.body?.code}`;
  }
}

beforeEach(() => {
  taken = false;
  checked.length = 0;
});

describe("account creation with an address another account's inbox gets", () => {
  it("is refused with a 403 on self-service sign-up (sign-up then answers as for a taken address)", async () => {
    taken = true;
    expect(await outcome("/sign-up/email")).toBe("403 EMAIL_ALIAS_TAKEN");
    expect(await outcome("/callback/:id")).toBe("403 EMAIL_ALIAS_TAKEN");
    expect(checked).toEqual([newUser.email, newUser.email]);
  });

  it("is left to admins, SSO, SCIM and server calls", async () => {
    taken = true;
    for (const path of ["/admin/create-user", "/sso/callback/:providerId", "/scim/v2/Users", undefined]) {
      expect(await outcome(path)).toBe("ok");
    }
    expect(checked).toEqual([]);
  });

  it("goes through when no account matches", async () => {
    expect(await outcome("/sign-up/email")).toBe("ok");
  });
});
