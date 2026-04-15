import { describe, expect, test } from "vitest";
import { formatYyyyMm, monthLabel, nextMonth, parseYyyyMm } from "~/lib/month-utils";

describe("month-utils", () => {
  test("parseYyyyMm parses 'YYYY-MM'", () => {
    expect(parseYyyyMm("2026-04")).toEqual({ year: 2026, month: 4 });
  });

  test("parseYyyyMm rejects bad input", () => {
    expect(() => parseYyyyMm("2026-13")).toThrow();
    expect(() => parseYyyyMm("abc")).toThrow();
    expect(() => parseYyyyMm("2026-00")).toThrow();
  });

  test("formatYyyyMm formats with zero-padding", () => {
    expect(formatYyyyMm(2026, 4)).toBe("2026-04");
    expect(formatYyyyMm(2026, 12)).toBe("2026-12");
  });

  test("nextMonth rolls over at December", () => {
    expect(nextMonth(2026, 4)).toEqual({ year: 2026, month: 5 });
    expect(nextMonth(2026, 12)).toEqual({ year: 2027, month: 1 });
  });

  test("monthLabel returns French full name", () => {
    expect(monthLabel(2026, 4)).toBe("Avril 2026");
    expect(monthLabel(2026, 1)).toBe("Janvier 2026");
  });
});
