import { globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * ESLint rules shared by the apps and packages: Next.js core web vitals and TypeScript.
 * Each eslint.config.mjs spreads this and adds its own ignores and overrides.
 */
export const baseConfig = [
  ...nextVitals,
  ...nextTs,
  // eslint-config-next's default ignores, kept when a config adds its own.
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
];
