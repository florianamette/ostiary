import { describe, expect, it, vi } from "vitest";

import { safeGet, type SafeFetcher, type SafeGetOptions } from "@ostiary/core/lib/app-icons/fetch";
import { findIconLinks } from "@ostiary/core/lib/app-icons/html";
import { sniffImageType } from "@ostiary/core/lib/app-icons/image";
import { resolveAppIcon } from "@ostiary/core/lib/app-icons/resolve";
import { appIconSource, appSite, isUsableLogoUri } from "@ostiary/core/lib/app-icons/site";
import type { GetResult } from "@ostiary/core/lib/webhooks/transport";
import type { Lookup } from "@ostiary/core/lib/webhooks/url-safety";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const ICO = Buffer.from([0, 0, 1, 0, 1, 0, 16, 16]);
const SVG = Buffer.from('<?xml version="1.0"?>\n<!-- logo --><svg xmlns="http://www.w3.org/2000/svg"></svg>');

describe("app site", () => {
  it("prefers client_uri", () => {
    expect(appSite({ uri: "https://github.com/apps/x", redirectUris: ["https://other.example.org/cb"] })).toEqual({
      url: "https://github.com/apps/x",
      host: "github.com",
      iconOrigin: "https://github.com",
    });
  });

  it("falls back to the first public https redirect URI", () => {
    const site = appSite({
      uri: null,
      redirectUris: [
        "com.example.app:/oauth/callback",
        "http://localhost:3000/callback",
        "https://127.0.0.1/cb",
        "https://10.0.0.8/cb",
        "https://intranet/cb",
        "https://app.local/cb",
        "https://www.cyberlibrary.com/api/auth/callback/ostiary",
      ],
    });
    expect(site).toEqual({ url: "https://www.cyberlibrary.com/", host: "www.cyberlibrary.com", iconOrigin: "https://www.cyberlibrary.com" });
  });

  it("has no site for native, loopback or private-only clients", () => {
    expect(appSite({ redirectUris: ["myapp://cb", "http://127.0.0.1:8080/cb", "https://localhost/cb"] })).toBeNull();
    expect(appSite({ uri: "http://169.254.169.254/latest", redirectUris: [] })).toBeNull();
    expect(appSite({ uri: "https://192.168.1.10", redirectUris: ["https://[::1]/cb"] })).toBeNull();
  });

  it("looks icons up on https port 443 only", () => {
    expect(appSite({ uri: "http://example.com/" })?.iconOrigin).toBe("https://example.com");
    expect(appSite({ uri: "https://example.com:8443/" })?.iconOrigin).toBeNull();
    expect(appIconSource({ uri: "https://example.com:8443/" })).toBeNull();
  });

  it("uses the registered logo first, https only", () => {
    expect(appIconSource({ icon: "https://cdn.example.com/logo.png", uri: "https://example.com" })).toEqual({ kind: "logo", url: "https://cdn.example.com/logo.png" });
    expect(appIconSource({ icon: "http://cdn.example.com/logo.png", uri: "https://example.com" })).toEqual({ kind: "site", origin: "https://example.com" });
    expect(appIconSource({ icon: "https://169.254.169.254/logo.png", uri: null, redirectUris: [] })).toBeNull();
  });

  it("accepts as a logo only what the icon lookup would fetch", () => {
    expect(isUsableLogoUri("https://cdn.example.com/logo.png")).toBe(true);
    expect(isUsableLogoUri("https://cdn.example.com:443/logo.png")).toBe(true);
    for (const raw of [
      "",
      null,
      "not a url",
      "http://cdn.example.com/logo.png",
      "https://localhost/logo.png",
      "https://127.0.0.1/logo.png",
      "https://192.168.1.10/logo.png",
      "https://app.local/logo.png",
      "https://cdn.example.com:8443/logo.png",
      "https://user:pass@cdn.example.com/logo.png",
      `https://cdn.example.com/${"a".repeat(2048)}.png`,
    ]) {
      expect(isUsableLogoUri(raw)).toBe(false);
    }
  });
});

describe("icon links in HTML", () => {
  const page = "https://www.example.com/en/home";

  it("ranks SVG, apple-touch-icon and big sizes above a plain favicon", () => {
    const html = `<!doctype html><html><head>
      <link rel="shortcut icon" href="/favicon.ico">
      <link rel=icon type="image/png" sizes="16x16 32x32" href="icons/32.png">
      <LINK REL="apple-touch-icon" HREF="//static.example.com/apple.png">
      <link rel="icon" href="/logo.svg" type="image/svg+xml">
      <link rel="mask-icon" href="/pin.svg" color="#000">
      <link rel="icon" href="data:image/png;base64,AAAA">
      <link rel="stylesheet" href="/site.css">
    </head><body><link rel="icon" href="/late.png"></body></html>`;
    expect(findIconLinks(html, page).map((c) => c.url)).toEqual([
      "https://www.example.com/logo.svg",
      "https://static.example.com/apple.png",
      "https://www.example.com/en/icons/32.png",
      "https://www.example.com/favicon.ico",
    ]);
  });

  it("prefers the largest declared size", () => {
    const html = `<link rel="icon" sizes="192x192" href="/192.png"><link rel="icon" sizes="48x48" href="/48.png"><link rel="apple-touch-icon" sizes="120x120" href="/120.png">`;
    expect(findIconLinks(html, page).map((c) => c.url)).toEqual([
      "https://www.example.com/192.png",
      "https://www.example.com/120.png",
      "https://www.example.com/48.png",
    ]);
  });

  it("honors <base href>, decodes entities and ignores comments and scripts", () => {
    const html = `<head><base href="https://cdn.example.net/assets/">
      <!-- <link rel="icon" href="/commented.png"> -->
      <script>document.write('<link rel="icon" href="/script.png">')</script>
      <link href='fav.png?v=1&amp;t=2' rel='icon'></head>`;
    expect(findIconLinks(html, page).map((c) => c.url)).toEqual(["https://cdn.example.net/assets/fav.png?v=1&t=2"]);
  });

  it("drops non-web schemes", () => {
    expect(findIconLinks(`<link rel="icon" href="javascript:alert(1)"><link rel="icon" href="file:///etc/passwd">`, page)).toEqual([]);
  });
});

describe("image sniffing", () => {
  it("recognizes images from their bytes, whatever the server says", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(ICO)).toBe("image/x-icon");
    expect(sniffImageType(SVG)).toBe("image/svg+xml");
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  });

  it("refuses HTML and scripts", () => {
    expect(sniffImageType(Buffer.from("<!doctype html><svg></svg>"))).toBeNull();
    expect(sniffImageType(Buffer.from("<html><body><svg/></body></html>"))).toBeNull();
    expect(sniffImageType(Buffer.from("alert(1)"))).toBeNull();
  });
});

type Route = { status?: number; type?: string; body?: Buffer | string; url?: string };

/** A fake network: answers by URL and records what was asked. */
function fakeFetch(routes: Record<string, Route>) {
  const calls: string[] = [];
  const fetch: SafeFetcher = async (url) => {
    calls.push(url);
    const route = routes[url];
    if (!route) return { ok: true, response: { url, status: 404, contentType: "text/html", body: Buffer.from("nope") } };
    const body = typeof route.body === "string" ? Buffer.from(route.body) : (route.body ?? Buffer.alloc(0));
    return { ok: true, response: { url: route.url ?? url, status: route.status ?? 200, contentType: route.type ?? "", body } };
  };
  return { fetch, calls };
}

describe("icon resolution", () => {
  it("takes the best icon linked from the home page, after its redirect", async () => {
    const { fetch, calls } = fakeFetch({
      "https://cyberlibrary.com/": {
        url: "https://www.cyberlibrary.com/",
        type: "text/html; charset=utf-8",
        body: `<head><link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/apple-touch-icon.png"></head>`,
      },
      "https://www.cyberlibrary.com/apple-touch-icon.png": { type: "image/png", body: PNG },
    });
    const result = await resolveAppIcon({ kind: "site", origin: "https://cyberlibrary.com" }, { fetch });
    expect(result).toEqual({ ok: true, icon: { contentType: "image/png", data: PNG } });
    expect(calls).toEqual(["https://cyberlibrary.com/", "https://www.cyberlibrary.com/apple-touch-icon.png"]);
  });

  it("falls back to /favicon.ico when the page links nothing usable", async () => {
    const { fetch, calls } = fakeFetch({
      "https://example.com/": { type: "text/html", body: `<link rel="icon" href="/broken.png">` },
      "https://example.com/broken.png": { type: "text/html", body: "<html>" },
      "https://example.com/favicon.ico": { type: "image/vnd.microsoft.icon", body: ICO },
    });
    const result = await resolveAppIcon({ kind: "site", origin: "https://example.com" }, { fetch });
    expect(result.ok && result.icon.contentType).toBe("image/x-icon");
    expect(calls).toEqual(["https://example.com/", "https://example.com/broken.png", "https://example.com/favicon.ico"]);
  });

  it("refuses an image whose bytes are not an image", async () => {
    const { fetch } = fakeFetch({ "https://cdn.example.com/logo.png": { type: "image/png", body: "<script>alert(1)</script>" } });
    const result = await resolveAppIcon({ kind: "logo", url: "https://cdn.example.com/logo.png" }, { fetch });
    expect(result.ok).toBe(false);
  });

  it("upgrades http icon links to https", async () => {
    const { fetch, calls } = fakeFetch({
      "https://example.org/": { type: "text/html", body: `<link rel="icon" sizes="64x64" href="http://example.org/i.png">` },
      "https://example.org/i.png": { type: "image/png", body: PNG },
    });
    expect((await resolveAppIcon({ kind: "site", origin: "https://example.org" }, { fetch })).ok).toBe(true);
    expect(calls).not.toContain("http://example.org/i.png");
  });
});

const resolvesTo =
  (map: Record<string, string>): Lookup =>
  async (hostname) => {
    const address = map[hostname];
    if (!address) throw new Error("ENOTFOUND");
    return [{ address, family: address.includes(":") ? 6 : 4 }];
  };

function okGet(status: number, headers: Record<string, string>, body = ""): GetResult {
  return { ok: true, status, headers, body: Buffer.from(body), truncated: false };
}

describe("safe fetching (SSRF)", () => {
  const options = (lookup: Lookup, get: SafeGetOptions["get"]): SafeGetOptions => ({ maxBytes: 1024, accept: "*/*", lookup, get });

  it.each([
    "http://example.com/",
    "https://169.254.169.254/latest/meta-data/",
    "https://10.0.0.1/",
    "https://localhost/",
    "https://[::1]/",
    "https://metadata.google.internal/",
    "https://example.com:8443/",
  ])("never connects to %s", async (url) => {
    const get = vi.fn();
    const result = await safeGet(url, options(resolvesTo({ "example.com": "93.184.215.14" }), get));
    expect(result.ok).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });

  it("refuses a public name that resolves to a private address", async () => {
    const get = vi.fn();
    const result = await safeGet("https://rebind.example.com/", options(resolvesTo({ "rebind.example.com": "169.254.169.254" }), get));
    expect(result.ok).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });

  it("connects only to the checked addresses", async () => {
    const get = vi.fn(async () => okGet(200, { "content-type": "image/png" }, "x"));
    const result = await safeGet("https://cdn.example.com/a.png", options(resolvesTo({ "cdn.example.com": "93.184.215.14" }), get));
    expect(result.ok).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
    expect((get.mock.calls[0] as unknown[])[1]).toEqual([{ address: "93.184.215.14", family: 4 }]);
  });

  it("re-checks every redirect and refuses one into the private network", async () => {
    const get = vi.fn(async (url: URL) =>
      url.hostname === "example.com" ? okGet(302, { location: "https://internal.example.com/" }) : okGet(200, {}, "secret"),
    );
    const lookup = resolvesTo({ "example.com": "93.184.215.14", "internal.example.com": "10.0.0.5" });
    const result = await safeGet("https://example.com/", options(lookup, get));
    expect(result.ok).toBe(false);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("follows at most two redirects", async () => {
    let n = 0;
    const get = vi.fn(async () => okGet(301, { location: `https://example.com/${++n}` }));
    const result = await safeGet("https://example.com/", options(resolvesTo({ "example.com": "93.184.215.14" }), get));
    expect(result).toEqual({ ok: false, error: "Too many redirects." });
    expect(get).toHaveBeenCalledTimes(3);
  });

  it("refuses an answer larger than the cap", async () => {
    const get = vi.fn(async (): Promise<GetResult> => ({ ok: true, status: 200, headers: {}, body: Buffer.alloc(1024), truncated: true }));
    const result = await safeGet("https://example.com/", options(resolvesTo({ "example.com": "93.184.215.14" }), get));
    expect(result.ok).toBe(false);
  });

  it("resolves a client pointing at the metadata service to nothing, without any request", async () => {
    const source = appIconSource({ uri: "http://169.254.169.254/", redirectUris: ["https://192.168.0.2/cb"] });
    expect(source).toBeNull();
  });
});

describe("pinned GET", () => {
  it("connects to the checked address, keeps the Host header and cuts a long answer", async () => {
    const { createServer } = await import("node:http");
    const { getPinned } = await import("@ostiary/core/lib/webhooks/transport");
    const server = createServer((req, res) => {
      res.writeHead(200, { "content-type": "image/png", "x-host": req.headers.host ?? "" });
      res.end(Buffer.alloc(5000, 1));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    try {
      const url = new URL(`http://icons.invalid:${port}/a.png`);
      const result = await getPinned(url, [{ address: "127.0.0.1", family: 4 }], {}, { maxBytes: 1000, timeoutMs: 2000 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.headers["x-host"]).toBe(`icons.invalid:${port}`);
        expect(result.body.length).toBe(1000);
        expect(result.truncated).toBe(true);
      }
    } finally {
      server.close();
    }
  });
});

describe("pinned GET decoding", () => {
  it("decodes gzip and caps the decoded size (no compression bomb)", async () => {
    const { createServer } = await import("node:http");
    const { gzipSync } = await import("node:zlib");
    const { getPinned } = await import("@ostiary/core/lib/webhooks/transport");
    const html = `<head><link rel="icon" href="/x.svg"></head>${"a".repeat(5_000_000)}`;
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
      res.end(gzipSync(html));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    try {
      const result = await getPinned(new URL(`http://page.invalid:${port}/`), [{ address: "127.0.0.1", family: 4 }], {}, { maxBytes: 4096, timeoutMs: 2000 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.truncated).toBe(true);
        expect(result.body.length).toBe(4096);
        expect(result.body.toString().startsWith('<head><link rel="icon"')).toBe(true);
      }
    } finally {
      server.close();
    }
  });
});
