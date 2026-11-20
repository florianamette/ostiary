import pg from "pg";

/*
 * Database connection helpers shared by the app pool (db/index.ts), the seed script and
 * drizzle-kit. No env import here: the seed script loads its env files first.
 */

const ALIASED_SSL_MODES = new Set(["prefer", "require", "verify-ca"]);

/**
 * pg 8 treats `sslmode=prefer`, `require` and `verify-ca` as `verify-full` (TLS required,
 * certificate and host name checked) and prints a SECURITY WARNING on every start saying so.
 * Hosted Postgres URLs (Neon, Supabase, Vercel Postgres) carry `sslmode=require`, so the
 * warning fills the logs. This writes the mode pg already applies, `verify-full`: the
 * connection is exactly as secure as before, minus the warning.
 *
 * Left as they are: URLs without these modes, and URLs that opt into libpq semantics with
 * `uselibpqcompat=true` (there `require` really means "encrypt, do not verify"). Only the
 * `sslmode` value changes; the rest of the URL (password encoding included) is kept as is.
 */
export function normalizeSslMode(url: string): string {
  const query = url.indexOf("?");
  if (query === -1) return url;
  const params = url.slice(query + 1).split("#")[0].split("&");
  if (params.some((p) => p.split("=")[0].toLowerCase() === "uselibpqcompat")) return url;
  return url.replace(/([?&]sslmode=)([^&#]*)/gi, (match, key: string, mode: string) =>
    ALIASED_SSL_MODES.has(mode.toLowerCase()) ? `${key}verify-full` : match,
  );
}

const TRANSIENT_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  // Postgres: the server is starting up or shutting down.
  "57P03",
]);

/**
 * True for errors raised while opening a connection that a new attempt may not hit: the
 * server is waking up (serverless Postgres such as Neon), was restarting, or the network
 * dropped the attempt. Not retried: bad credentials, an unknown database, a pool that has
 * been ended, or a pool that is full ("timeout exceeded when trying to connect": waiting
 * again would only add load).
 */
export function isTransientConnectError(error: unknown): boolean {
  for (let e: unknown = error, depth = 0; e instanceof Error && depth < 4; e = e.cause, depth++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && TRANSIENT_CODES.has(code)) return true;
    if (/^Connection terminated/.test(e.message)) return true;
  }
  return false;
}

export type ConnectRetryOptions = {
  /** Attempts in all, the first included (default 3). */
  attempts?: number;
  /** Pause before each new attempt, in ms (default 250, then 1000). */
  delaysMs?: number[];
  /** No new attempt once this much time has gone by since the first one (default 12 s). */
  budgetMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (error: unknown, attempt: number) => void;
};

/** Runs `connect` again after a transient failure, within a few attempts and a time budget. */
export async function connectWithRetry<T>(connect: () => Promise<T>, options: ConnectRetryOptions = {}): Promise<T> {
  const attempts = options.attempts ?? 3;
  const delays = options.delaysMs ?? [250, 1_000];
  const budgetMs = options.budgetMs ?? 12_000;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const onRetry =
    options.onRetry ??
    ((error: unknown, attempt: number) =>
      console.warn(`[db] Connection failed (attempt ${attempt} of ${attempts}), retrying:`, (error as Error)?.message));

  const started = now();
  for (let attempt = 1; ; attempt++) {
    try {
      return await connect();
    } catch (error) {
      const delay = delays[Math.min(attempt - 1, delays.length - 1)] ?? 0;
      if (attempt >= attempts || !isTransientConnectError(error) || now() - started + delay > budgetMs) throw error;
      onRetry(error, attempt);
      await sleep(delay);
    }
  }
}

type ConnectCallback = (err: Error | undefined, client: pg.PoolClient | undefined, done: (release?: unknown) => void) => void;

/**
 * A pg pool whose new connections are retried after a transient failure, so a request that
 * arrives while a serverless database wakes up waits a moment instead of failing with a 500.
 * Covers every query: `pool.query()` and Drizzle both go through `connect()`. A retry only
 * ever reopens a connection; no query is sent twice.
 */
export class RetryingPool extends pg.Pool {
  private readonly retry: ConnectRetryOptions;

  constructor(config: pg.PoolConfig, retry: ConnectRetryOptions = {}) {
    super(config);
    this.retry = retry;
  }

  override connect(): Promise<pg.PoolClient>;
  override connect(callback: ConnectCallback): void;
  override connect(callback?: ConnectCallback): Promise<pg.PoolClient> | void {
    const connected = connectWithRetry(() => super.connect(), this.retry);
    if (!callback) return connected;
    // pool.query() uses the callback form. Called outside the promise chain, so an error
    // thrown by the callback is not swallowed as a rejection.
    connected.then(
      (client) => process.nextTick(() => callback(undefined, client, (release) => client.release(release as Error))),
      (error: Error) => process.nextTick(() => callback(error, undefined, () => {})),
    );
  }
}
