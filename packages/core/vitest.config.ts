import { vitestConfig } from "./config/vitest.mjs";

export default vitestConfig(import.meta.dirname, { include: ["src/**/*.test.ts"] });
