import { defineConfig } from "eslint/config";

import { baseConfig } from "../../packages/core/config/eslint.mjs";

export default defineConfig([...baseConfig]);
