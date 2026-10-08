import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

import type { ResolvedAddress } from "@ostiary/core/lib/webhooks/url-safety";

/** How long a receiver has to answer. */
export const DELIVERY_TIMEOUT_MS = 10_000;
/** How much of the answer is kept for the delivery log. */
export const RESPONSE_EXCERPT_LENGTH = 500;

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
