import { describe, expect, test } from "vitest";
import { centsToEuros, eurosToCents, formatEuros } from "~/lib/money";

describe("money", () => {
  test("eurosToCents converts string input", () => {
    expect(eurosToCents("12.34")).toBe(1234);
    expect(eurosToCents("0")).toBe(0);
    expect(eurosToCents("100")).toBe(10000);
  });

  test("eurosToCents handles comma decimal", () => {
    expect(eurosToCents("12,34")).toBe(1234);
  });

  test("centsToEuros converts integer cents", () => {
    expect(centsToEuros(1234)).toBe(12.34);
    expect(centsToEuros(0)).toBe(0);
  });

  test("formatEuros formats with 2 decimals and EUR sign", () => {
    expect(formatEuros(1234)).toMatch(/12,34\s*€/);
    expect(formatEuros(0)).toMatch(/0,00\s*€/);
    expect(formatEuros(100000)).toMatch(/1\s*000,00\s*€/);
  });

  test("eurosToCents rejects invalid input", () => {
    expect(() => eurosToCents("abc")).toThrow();
  });
});
