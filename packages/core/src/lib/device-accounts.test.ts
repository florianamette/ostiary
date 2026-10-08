import { describe, expect, it } from "vitest";

import { addAccountHref, orderDeviceAccounts } from "@ostiary/core/lib/device-accounts";

const row = (id: string, email: string, name: string | null = null) => ({ session: { token: `t_${id}` }, user: { id, email, name } });

describe("orderDeviceAccounts", () => {
  it("puts the active account first, then the others by email", () => {
    const accounts = orderDeviceAccounts([row("b", "b@x.io"), row("c", "c@x.io", "Cy"), row("a", "a@x.io")], "c");
    expect(accounts.map((a) => a.userId)).toEqual(["c", "a", "b"]);
    expect(accounts[0]).toEqual({ token: "t_c", userId: "c", name: "Cy", email: "c@x.io" });
    expect(accounts[1]!.name).toBe("");
  });
});

describe("addAccountHref", () => {
  it("keeps the OAuth query and marks the visit", () => {
    const href = addAccountHref("fr", "client_id=app&sig=abc&ba_param=client_id");
    const url = new URL(href, "https://auth.example.com");
    expect(url.pathname).toBe("/fr/login");
    expect(url.searchParams.get("client_id")).toBe("app");
    expect(url.searchParams.get("sig")).toBe("abc");
    expect(url.searchParams.get("addAccount")).toBe("1");
  });

  it("works without a query", () => {
    expect(addAccountHref("en")).toBe("/en/login?addAccount=1");
  });
});
