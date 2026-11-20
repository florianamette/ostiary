import { hashSync } from "bcryptjs";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { describe, expect, it, vi } from "vitest";

import { importedHashProblem, importedPasswordVerifier, isBcryptHash } from "@ostiary/core/lib/user-import/password-hash";

const bcrypt = hashSync("correct horse", 4);

describe("imported hash detection", () => {
  it("recognizes $2a$, $2b$ and $2y$ bcrypt hashes", () => {
    expect(bcrypt).toMatch(/^\$2b\$04\$/);
    for (const prefix of ["$2a$", "$2b$", "$2y$"]) {
      const hash = prefix + bcrypt.slice(4);
      expect(isBcryptHash(hash)).toBe(true);
      expect(importedHashProblem(hash)).toBeNull();
    }
  });

  it("refuses other formats", async () => {
    const refused = [
      "$2x$04" + bcrypt.slice(6), // crypt_blowfish's buggy variant
      bcrypt.slice(0, -1), // truncated
      "$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA",
      "$6$salt$hash",
      "5f4dcc3b5aa765d61d8327deb882cf99", // MD5
      "plaintext password",
      await hashPassword("x"), // Better Auth's own scrypt: not an import format
      "",
    ];
    for (const hash of refused) expect(importedHashProblem(hash), hash).toBe("unsupportedHash");
  });

  it("refuses a bcrypt cost too low or too high to use", () => {
    expect(importedHashProblem(bcrypt.replace("$04$", "$03$"))).toBe("bcryptCost");
    expect(importedHashProblem(bcrypt.replace("$04$", "$15$"))).toBe("bcryptCost");
    expect(importedHashProblem(bcrypt.replace("$04$", "$14$"))).toBeNull();
  });
});

describe("password verify", () => {
  it("accepts the bcrypt password and replaces the hash with a scrypt hash of it", async () => {
    const replace = vi.fn(async () => {});
    const verify = importedPasswordVerifier(replace);
    expect(await verify({ hash: bcrypt, password: "correct horse" })).toBe(true);
    expect(replace).toHaveBeenCalledTimes(1);
    const [old, next] = replace.mock.calls[0] as unknown as [string, string];
    expect(old).toBe(bcrypt);
    expect(isBcryptHash(next)).toBe(false);
    expect(await verifyPassword({ hash: next, password: "correct horse" })).toBe(true);
  });

  it("refuses a wrong password and keeps the hash", async () => {
    const replace = vi.fn(async () => {});
    const verify = importedPasswordVerifier(replace);
    expect(await verify({ hash: bcrypt, password: "wrong" })).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });

  it("checks scrypt hashes with Better Auth's default verify", async () => {
    const replace = vi.fn(async () => {});
    const verify = importedPasswordVerifier(replace);
    const scrypt = await hashPassword("s3cret-pass");
    expect(await verify({ hash: scrypt, password: "s3cret-pass" })).toBe(true);
    expect(await verify({ hash: scrypt, password: "other" })).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });

  it("refuses a bcrypt hash above the cost limit without computing it", async () => {
    const replace = vi.fn(async () => {});
    const expensive = bcrypt.replace("$04$", "$31$");
    expect(await importedPasswordVerifier(replace)({ hash: expensive, password: "correct horse" })).toBe(false);
  });

  it("still signs in when storing the new hash fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const verify = importedPasswordVerifier(async () => {
      throw new Error("database down");
    });
    expect(await verify({ hash: bcrypt, password: "correct horse" })).toBe(true);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
