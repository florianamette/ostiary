import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

import { postPinned } from "@ostiary/core/lib/webhooks/transport";
import { checkWebhookUrl, parseWebhookUrl, type Lookup } from "@ostiary/core/lib/webhooks/url-safety";

const resolvesTo =
  (...addresses: string[]): Lookup =>
  async () =>
    addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));

describe("webhook URL form", () => {
  it.each([
    ["http://example.com/hook", "https://"],
    ["ftp://example.com/hook", "https://"],
    ["not a url", "absolute URL"],
    ["https://user:pass@example.com/hook", "user name or password"],
    ["https://example.com/hook#x", "fragment"],
    ["https://localhost/hook", "localhost"],
    ["https://127.0.0.1/hook", "localhost"],
    ["https://[::1]/hook", "localhost"],
    ["https://10.0.0.5/hook", "private"],
    ["https://192.168.1.1/hook", "private"],
    ["https://169.254.169.254/latest/meta-data", "link-local"],
    ["https://metadata.google.internal/", "cloud metadata"],
    ["https://[fd00::1]/hook", "private"],
    ["https://[::ffff:127.0.0.1]/hook", "localhost"],
    ["https://0.0.0.0/hook", "non-public"],
  ])("refuses %s", (url, message) => {
    const result = parseWebhookUrl(url, false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });

  it("accepts public https URLs", () => {
    expect(parseWebhookUrl("https://app.example.com/webhooks?x=1", false).ok).toBe(true);
    expect(parseWebhookUrl("https://93.184.215.14:8443/hook", false).ok).toBe(true);
  });

  it("accepts http://localhost only with the development flag, and never private ranges", () => {
    expect(parseWebhookUrl("http://localhost:3139/hook", false).ok).toBe(false);
    expect(parseWebhookUrl("http://localhost:3139/hook", true).ok).toBe(true);
    expect(parseWebhookUrl("http://127.0.0.1:3139/hook", true).ok).toBe(true);
    expect(parseWebhookUrl("http://example.com/hook", true).ok).toBe(false);
    expect(parseWebhookUrl("https://10.0.0.5/hook", true).ok).toBe(false);
  });
});

describe("webhook URL resolution", () => {
  it("accepts a host whose addresses are all public", async () => {
    const result = await checkWebhookUrl("https://hooks.example.com/x", false, resolvesTo("93.184.215.14", "2606:2800:21f:cb07:6820:80da:af6b:8b2c"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.addresses.map((a) => a.address)).toEqual(["93.184.215.14", "2606:2800:21f:cb07:6820:80da:af6b:8b2c"]);
  });

  it.each([
    ["127.0.0.1"],
    ["10.1.2.3"],
    ["172.16.0.1"],
    ["169.254.169.254"],
    ["100.64.0.1"],
    ["::1"],
    ["fe80::1"],
    ["::ffff:10.0.0.1"],
  ])("refuses a public name that resolves to %s (DNS pointing inside)", async (address) => {
    const result = await checkWebhookUrl("https://evil.example.com/x", false, resolvesTo(address));
    expect(result.ok).toBe(false);
  });

  it("refuses when any one answer is private", async () => {
    const result = await checkWebhookUrl("https://mixed.example.com/x", false, resolvesTo("93.184.215.14", "10.0.0.1"));
    expect(result.ok).toBe(false);
  });

  it("refuses unresolvable hosts", async () => {
    const result = await checkWebhookUrl("https://nx.example.com/x", false, async () => {
      throw new Error("ENOTFOUND");
    });
    expect(result.ok).toBe(false);
    expect((await checkWebhookUrl("https://empty.example.com/x", false, resolvesTo())).ok).toBe(false);
  });

  it("lets localhost resolve to loopback with the development flag only", async () => {
    expect((await checkWebhookUrl("http://localhost:1/x", true, resolvesTo("127.0.0.1"))).ok).toBe(true);
    expect((await checkWebhookUrl("http://localhost:1/x", true, resolvesTo("10.0.0.1"))).ok).toBe(false);
  });
});

describe("pinned delivery", () => {
  it("connects to the checked address whatever the name resolves to, and keeps the Host header", async () => {
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        res.writeHead(201, { "content-type": "text/plain" });
        res.end(`${req.headers.host}|${req.headers["webhook-id"]}|${body}|${"x".repeat(2000)}`);
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    try {
      const result = await postPinned(new URL(`http://name-that-does-not-resolve.invalid:${port}/hook`), [{ address: "127.0.0.1", family: 4 }], { "webhook-id": "evt_1" }, '{"a":1}');
      expect(result.ok).toBe(true);
      expect(result.status).toBe(201);
      expect(result.excerpt.startsWith(`name-that-does-not-resolve.invalid:${port}|evt_1|{"a":1}|`)).toBe(true);
      expect(result.excerpt.length).toBe(500);
    } finally {
      server.close();
    }
  });

  it("falls back to the next checked address when the first refuses the connection", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(204);
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    try {
      const result = await postPinned(new URL(`http://localhost:${port}/hook`), [{ address: "::1", family: 6 }, { address: "127.0.0.1", family: 4 }], {}, "{}");
      expect(result).toMatchObject({ ok: true, status: 204 });
    } finally {
      server.close();
    }
  });

  it("treats redirects as failures and times out slow receivers", async () => {
    const server = createServer((req, res) => {
      if (req.url === "/redirect") {
        res.writeHead(302, { location: "http://169.254.169.254/" });
        res.end();
      }
      // "/slow" never answers.
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    const address = [{ address: "127.0.0.1", family: 4 }];
    try {
      const redirected = await postPinned(new URL(`http://localhost:${port}/redirect`), address, {}, "{}");
      expect(redirected).toMatchObject({ ok: false, status: 302 });
      const slow = await postPinned(new URL(`http://localhost:${port}/slow`), address, {}, "{}", 200);
      expect(slow).toMatchObject({ ok: false, status: null });
      expect(slow.excerpt).toContain("No answer");
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });
});
