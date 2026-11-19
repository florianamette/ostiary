import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The checks guardRequests adds in front of Better Auth's endpoints, driven through the
 * middleware itself with a fake endpoint context. The settings it syncs on every request and
 * the database are faked: only the decisions are under test.
 */

type Session = { user: Record<string, unknown>; session: Record<string, unknown> } | null;
let currentSession: Session = null;
let blockers: { kind: string }[] = [];
let claimedDomains: string[] = [];
let aliasTaken: { email: string; exceptUserId?: string }[] = [];
const events: unknown[][] = [];

vi.mock("better-auth/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("better-auth/api")>()),
  getSessionFromCtx: async () => currentSession,
}));
vi.mock("@ostiary/core/db/index", () => ({ db: {} }));
vi.mock("@ostiary/core/lib/security/sso-domain-claims", () => ({
  ssoDomainClaimed: async (domain: string) => claimedDomains.includes(domain.toLowerCase()),
}));
vi.mock("@ostiary/core/lib/security/email-aliases", () => ({
  emailAliasTaken: async (_db: unknown, email: string, _mode: string, exceptUserId?: string) => {
    aliasTaken.push({ email, exceptUserId });
    return email === "john.doe+x@gmail.com";
  },
}));
vi.mock("@ostiary/core/lib/oauth-scopes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ostiary/core/lib/oauth-scopes")>()),
  syncProviderScopes: async () => {},
}));
vi.mock("@ostiary/core/lib/signing-keys", () => ({ syncSigningKeys: async () => {} }));
vi.mock("@ostiary/core/lib/social-providers", () => ({ syncSocialProviders: async () => {}, googleOneTap: async () => null }));
vi.mock("@ostiary/core/lib/client-registration", () => ({
  syncClientRegistration: async () => ({ dynamic: "off" }),
  registrationCapacityLeft: async () => true,
}));
vi.mock("@ostiary/core/lib/account-data/blockers", () => ({
  ACCOUNT_DELETION_BLOCKED: "ACCOUNT_DELETION_BLOCKED",
  accountDeletionBlockers: async () => blockers,
}));
vi.mock("@ostiary/core/lib/auth-events", () => ({
  clientIp: () => "203.0.113.9",
  recordAuthEvent: async (...args: unknown[]) => {
    events.push(args);
  },
}));

const { guardRequests } = await import("@ostiary/core/lib/auth-hooks/request-guards");

const middleware = guardRequests({
  provider: { options: {} } as never,
  jwtOptions: {},
  metadataDocuments: undefined,
}) as unknown as (ctx: unknown) => Promise<unknown>;

let credential: { password?: string } | null = null;

function run(path: string, body: Record<string, unknown> = {}) {
  return middleware({
    path,
    body,
    query: {},
    headers: new Headers(),
    context: {
      internalAdapter: {
        findCredentialAccount: async () => credential,
        findSession: async () => null,
      },
    },
  });
}

/** The APIError code a guard threw, or "ok". */
async function outcome(path: string, body?: Record<string, unknown>): Promise<string> {
  try {
    await run(path, body);
    return "ok";
  } catch (error) {
    const e = error as { body?: { code?: string }; status?: string };
    return e.body?.code ?? String(e.status ?? error);
  }
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
const signedIn = (session: Record<string, unknown> = {}, user: Record<string, unknown> = {}): Session => ({
  user: { id: "u1", email: "a@example.com", emailVerified: true, role: "user", ...user },
  session: { createdAt: minutesAgo(1), ...session },
});

beforeEach(() => {
  currentSession = null;
  blockers = [];
  credential = null;
  events.length = 0;
  aliasTaken = [];
});

describe("adding a way to sign in", () => {
  it("needs a recent sign-in", async () => {
    currentSession = signedIn();
    expect(await outcome("/passkey/generate-register-options")).toBe("ok");
    currentSession = signedIn({ createdAt: minutesAgo(11) });
    expect(await outcome("/passkey/verify-registration")).toBe("RECENT_SIGN_IN_REQUIRED");
    expect(await outcome("/link-social")).toBe("RECENT_SIGN_IN_REQUIRED");
  });

  it("is refused to an administrator impersonating the account, however fresh", async () => {
    currentSession = signedIn({ impersonatedBy: "admin1" });
    expect(await outcome("/passkey/generate-register-options")).toBe("IMPERSONATING");
  });
});

describe("account deletion", () => {
  it("is refused while impersonating", async () => {
    currentSession = signedIn({ impersonatedBy: "admin1" });
    expect(await outcome("/delete-user")).toBe("IMPERSONATING");
  });

  it("is refused while a blocker applies", async () => {
    currentSession = signedIn();
    blockers = [{ kind: "admin" }];
    expect(await outcome("/delete-user", { password: "x" })).toBe("ACCOUNT_DELETION_BLOCKED");
  });

  it("asks for the password when the account has one", async () => {
    currentSession = signedIn();
    credential = { password: "hash" };
    expect(await outcome("/delete-user")).toBe("PASSWORD_REQUIRED");
    // Better Auth checks the password itself.
    expect(await outcome("/delete-user", { password: "secret" })).toBe("ok");
  });

  it("needs a recent sign-in without a password", async () => {
    currentSession = signedIn({ createdAt: minutesAgo(30) });
    expect(await outcome("/delete-user")).toBe("RECENT_SIGN_IN_REQUIRED");
    currentSession = signedIn();
    expect(await outcome("/delete-user")).toBe("ok");
  });

  it("lets the emailed token through (blockers are checked again before the delete)", async () => {
    currentSession = signedIn({ createdAt: minutesAgo(30) });
    blockers = [{ kind: "admin" }];
    expect(await outcome("/delete-user", { token: "t" })).toBe("ok");
  });
});

describe("email change", () => {
  it("needs the current address to be verified", async () => {
    currentSession = signedIn({}, { emailVerified: false });
    expect(await outcome("/change-email", { newEmail: "b@example.com" })).toBe("EMAIL_NOT_VERIFIED");
    currentSession = signedIn();
    expect(await outcome("/change-email", { newEmail: "b@example.com" })).toBe("ok");
  });

  it("answers an alias of another account's address as Better Auth answers a taken one", async () => {
    currentSession = signedIn();
    const answer = (await run("/change-email", { newEmail: "john.doe+x@gmail.com" })) as { status?: boolean } | undefined;
    expect(answer).toMatchObject({ status: true });
    expect(aliasTaken).toEqual([{ email: "john.doe+x@gmail.com", exceptUserId: "u1" }]);
    expect(await run("/change-email", { newEmail: "b@example.com" })).toBeUndefined();
  });
});

describe("SSO registration", () => {
  it("accepts only one plain lowercase domain", async () => {
    expect(await outcome("/sso/register", { domain: "acme.com" })).toBe("ok");
    for (const domain of ["Acme.com", "acme.com,victim.com", "https://acme.com", "attacker.com\\@victim.com", 3]) {
      expect(await outcome("/sso/register", { domain })).toBe("INVALID_SSO_DOMAIN");
    }
  });

  it("refuses a domain another provider already claims", async () => {
    claimedDomains = ["acme.com"];
    try {
      expect(await outcome("/sso/register", { domain: "acme.com" })).toBe("SSO_DOMAIN_TAKEN");
      expect(await outcome("/sso/register", { domain: "other.com" })).toBe("ok");
    } finally {
      claimedDomains = [];
    }
  });
});

describe("sign-out", () => {
  it("records who signs out, before the session is gone", async () => {
    currentSession = signedIn();
    await run("/sign-out");
    expect(events).toEqual([["sign_out", "u1", { ipAddress: "203.0.113.9" }]]);
  });
});
