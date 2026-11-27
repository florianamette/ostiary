/* A DNS name as admins type it (no database, so client components can import it). */

const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Lower-cases a host and strips a scheme or path pasted with it. Null when it is not a DNS name. */
export function normalizeHost(raw: string): string | null {
  let host = raw.trim().toLowerCase();
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      return null;
    }
  }
  host = host.replace(/\/.*$/, "").replace(/\.$/, "");
  return HOST.test(host) ? host : null;
}
