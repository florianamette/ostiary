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
