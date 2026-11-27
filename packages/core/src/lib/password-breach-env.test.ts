import { describe, expect, it } from "vitest";

import { envSchema } from "@ostiary/core/lib/env";

const baseEnv = {
  DATABASE_URL: "postgresql://localhost:5432/test",
  BETTER_AUTH_SECRET: "01234567890123456789012345678901",
};

describe("PASSWORD_BREACH_CHECK", () => {
  it("is on unless set to off", () => {
    expect(envSchema.parse(baseEnv).PASSWORD_BREACH_CHECK).toBe("on");
    expect(envSchema.parse({ ...baseEnv, PASSWORD_BREACH_CHECK: "" }).PASSWORD_BREACH_CHECK).toBe("on");
    expect(envSchema.parse({ ...baseEnv, PASSWORD_BREACH_CHECK: "off" }).PASSWORD_BREACH_CHECK).toBe("off");
  });

  it("refuses anything else, so a typo never turns the check off", () => {
    expect(envSchema.safeParse({ ...baseEnv, PASSWORD_BREACH_CHECK: "false" }).success).toBe(false);
  });
});
