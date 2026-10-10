import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { Transform } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

import type { ResolvedAddress } from "@ostiary/core/lib/webhooks/url-safety";

/** How long a receiver has to answer. */
const DELIVERY_TIMEOUT_MS = 10_000;
/** How much of the answer is kept for the delivery log. */
const RESPONSE_EXCERPT_LENGTH = 500;

export type PostResult =
  | { ok: boolean; status: number; excerpt: string }
  | { ok: false; status: null; excerpt: string };

/**
 * POSTs the body to the URL, connecting only to `addresses` (already checked by
 * checkWebhookUrl; Node tries them in turn, IPv6 and IPv4) while the hostname stays the Host
 * header and the TLS name. Redirects are not followed (a 3xx is a failure), and only the
 * start of the answer is read.
 */
export function postPinned(
  url: URL,
  addresses: ResolvedAddress[],
  headers: Record<string, string>,
  body: string,
  timeoutMs = DELIVERY_TIMEOUT_MS,
): Promise<PostResult> {
  const request = url.protocol === "http:" ? httpRequest : httpsRequest;
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: PostResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const req = request(
      url,
      {
        method: "POST",
        agent: false,
        headers: { ...headers, "content-type": "application/json", "content-length": Buffer.byteLength(body).toString(), host: url.host },
        servername: isIP(hostname) === 0 ? hostname : undefined,
        lookup: (_hostname, options, callback) => {
          if ((options as { all?: boolean }).all) {
            (callback as (err: null, addresses: ResolvedAddress[]) => void)(null, addresses);
          } else {
            (callback as (err: null, address: string, family: number) => void)(null, addresses[0]!.address, addresses[0]!.family);
          }
        },
      },
      (res: IncomingMessage) => {
        const status = res.statusCode ?? 0;
        const chunks: Buffer[] = [];
        let size = 0;
        const done = () => {
          const excerpt = Buffer.concat(chunks).toString("utf8").slice(0, RESPONSE_EXCERPT_LENGTH);
          finish({ ok: status >= 200 && status < 300, status, excerpt });
        };
        res.on("data", (chunk: Buffer) => {
          if (size < RESPONSE_EXCERPT_LENGTH * 4) {
            chunks.push(chunk);
            size += chunk.length;
          } else {
            // Enough for the log: stop reading a large answer.
            res.destroy();
            done();
          }
        });
        res.on("end", done);
        res.on("error", done);
        res.on("close", done);
      },
    );
    const timer = setTimeout(() => {
      req.destroy();
      finish({ ok: false, status: null, excerpt: `No answer within ${Math.round(timeoutMs / 1000)} s` });
    }, timeoutMs);
    req.on("error", (error: Error) => finish({ ok: false, status: null, excerpt: error.message.slice(0, RESPONSE_EXCERPT_LENGTH) }));
    req.end(body);
  });
}

export type GetResult =
  | { ok: true; status: number; headers: IncomingMessage["headers"]; body: Buffer; truncated: boolean }
  | { ok: false; error: string };

/** A decoder for the answer's Content-Encoding (null for none), or false when unsupported. */
function decoderFor(encoding: string | undefined): Transform | null | false {
  switch ((encoding ?? "").trim().toLowerCase()) {
    case "":
    case "identity":
      return null;
    case "gzip":
    case "x-gzip":
      return createGunzip();
    case "deflate":
      return createInflate();
    case "br":
      return createBrotliDecompress();
    default:
      return false;
  }
}

/**
 * GETs the URL like postPinned connects: only to `addresses`, with the hostname kept as Host
 * header and TLS name. Redirects are not followed (the caller checks the Location target and
 * calls again). gzip, deflate and br answers are decoded; at most `maxBytes` of the decoded
 * body are read (so a compression bomb stops there), a longer answer is cut and `truncated`.
 */
export function getPinned(
  url: URL,
  addresses: ResolvedAddress[],
  headers: Record<string, string>,
  { maxBytes, timeoutMs }: { maxBytes: number; timeoutMs: number },
): Promise<GetResult> {
  const request = url.protocol === "http:" ? httpRequest : httpsRequest;
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: GetResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      req.destroy();
      resolve(result);
    };
    const req = request(
      url,
      {
        method: "GET",
        agent: false,
        headers: { "accept-encoding": "gzip, deflate, br", ...headers, host: url.host },
        servername: isIP(hostname) === 0 ? hostname : undefined,
        lookup: (_hostname, options, callback) => {
          if ((options as { all?: boolean }).all) {
            (callback as (err: null, addresses: ResolvedAddress[]) => void)(null, addresses);
          } else {
            (callback as (err: null, address: string, family: number) => void)(null, addresses[0]!.address, addresses[0]!.family);
          }
        },
      },
      (res: IncomingMessage) => {
        const status = res.statusCode ?? 0;
        const decoder = decoderFor(res.headers["content-encoding"]);
        if (decoder === false) {
          finish({ ok: false, error: `Unsupported content encoding ${res.headers["content-encoding"]}` });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        const done = (truncated: boolean) =>
          finish({ ok: true, status, headers: res.headers, body: Buffer.concat(chunks), truncated });
        const body = decoder ? res.pipe(decoder) : res;
        body.on("data", (chunk: Buffer) => {
          if (settled) return;
          const room = maxBytes - size;
          if (chunk.length > room) {
            chunks.push(chunk.subarray(0, room));
            size = maxBytes;
            done(true);
            return;
          }
          chunks.push(chunk);
          size += chunk.length;
        });
        body.on("end", () => done(false));
        body.on("error", (error: Error) => finish({ ok: false, error: error.message }));
        res.on("error", (error: Error) => finish({ ok: false, error: error.message }));
        // A connection closed before the end of the body is a failure, not a short answer.
        res.on("close", () => {
          if (!res.complete) finish({ ok: false, error: "Connection closed early" });
        });
      },
    );
    const timer = setTimeout(() => {
      finish({ ok: false, error: `No answer within ${Math.round(timeoutMs / 1000)} s` });
    }, timeoutMs);
    req.on("error", (error: Error) => finish({ ok: false, error: error.message }));
    req.end();
  });
}
