import { defineConfig, globalIgnores } from "eslint/config";

import { baseConfig } from "../packages/core/config/eslint.mjs";

export default defineConfig([
  ...baseConfig,
  {
    // Playwright specs, not a Next.js app: no pages, and React only for the plugin's settings.
    settings: { react: { version: "19" } },
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      // Playwright fixtures receive a `use` callback, which this rule takes for React's hook.
      "react-hooks/rules-of-hooks": "off",
    },
  },
  globalIgnores(["playwright-report/**", "test-results/**", ".auth/**"]),
]);
