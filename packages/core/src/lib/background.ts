import { after } from "next/server";

/**
 * Runs `task` after the response, without making the caller wait for it. Inside a request,
 * Next.js `after()` keeps the function alive until the task ends (Vercel's waitUntil, or
 * `next start`); outside one (scripts, tests) it starts now in the background. A failure is
 * logged with `label` and never thrown: by then the response is already sent.
 */
export function runAfterResponse(label: string, task: () => Promise<unknown>): void {
  const run = () =>
    task().catch((error: unknown) => {
      console.error(`[${label}]`, error);
    });
  try {
    after(run);
  } catch {
    void run();
  }
}

/**
 * Better Auth's `advanced.backgroundTasks.handler`: its deferred work (rate-limit cleanup,
 * timing-attack padding, sends it would otherwise wait for) runs after the response and is
 * kept alive until it ends, as runAfterResponse does. Without a handler, Better Auth either
 * makes the response wait or leaves the promise to a serverless function that may be frozen.
 */
export function betterAuthBackgroundTask(promise: Promise<unknown>): void {
  const settled = promise.catch((error: unknown) => {
    console.error("[better-auth background task]", error);
  });
  try {
    after(() => settled);
  } catch {
    // Outside a request (scripts, tests): it is already running.
  }
}
