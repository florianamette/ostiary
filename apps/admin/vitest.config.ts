import { vitestConfig } from "../../packages/core/config/vitest.mjs";

export default vitestConfig(import.meta.dirname, { include: ["lib/**/*.test.ts"] });
