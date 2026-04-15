import bcrypt from "bcryptjs";
import { beforeAll, describe, expect, test } from "vitest";
import {
  isRateLimited,
  recordLoginAttempt,
  resetRateLimit,
  verifyPassword,
} from "~/lib/auth.server";

beforeAll(() => {
  process.env.HOUSEHOLD_PASSWORD_HASH = bcrypt.hashSync("letmein", 8);
});

describe("verifyPassword", () => {
  test("returns true on match", () => {
    expect(verifyPassword("letmein")).toBe(true);
  });

  test("returns false on mismatch", () => {
    expect(verifyPassword("wrong")).toBe(false);
  });
});

describe("rate limiter", () => {
  test("allows up to 5 attempts then blocks", () => {
    resetRateLimit();
    const ip = "1.2.3.4";
    for (let i = 0; i < 5; i++) {
      expect(isRateLimited(ip)).toBe(false);
      recordLoginAttempt(ip);
    }
    expect(isRateLimited(ip)).toBe(true);
  });
});
