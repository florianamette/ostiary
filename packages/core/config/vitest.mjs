import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const coreDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Vitest configuration of a workspace package (`pnpm test` runs each one): the
 * `@ostiary/core/*` alias, `@/*` for an app's own files, and the test environment variables
 * of packages/core/vitest.setup.ts.
 */
export function vitestConfig(packageDir, { include = ["**/*.test.ts"] } = {}) {
  return defineConfig({
    resolve: {
      alias: {
        "@ostiary/core": path.join(coreDir, "src"),
        "@": packageDir,
      },
    },
    test: {
      environment: "node",
      setupFiles: [path.join(coreDir, "vitest.setup.ts")],
      include,
      exclude: ["**/node_modules/**", "**/.next/**"],
    },
  });
}
