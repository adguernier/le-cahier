import { describe, expect, test } from "vitest";
import {
  expenseSchema,
  incomeSchema,
  memberSchema,
} from "~/lib/validation";

describe("validation", () => {
  test("memberSchema rejects empty name", () => {
    expect(
      memberSchema.safeParse({ name: "", defaultCostOfLiving: "800" }).success
    ).toBe(false);
  });

  test("memberSchema converts euros to cents", () => {
    const r = memberSchema.parse({ name: "Alice", defaultCostOfLiving: "800" });
    expect(r.defaultCostOfLiving).toBe(80000);
  });

  test("expenseSchema requires at least one member", () => {
    const r = expenseSchema.safeParse({
      label: "Loyer",
      amount: "500",
      categoryId: "1",
      memberIds: [],
    });
    expect(r.success).toBe(false);
  });

  test("incomeSchema parses values", () => {
    const r = incomeSchema.parse({ amount: "1500", costOfLiving: "800" });
    expect(r).toEqual({ amount: 150000, costOfLiving: 80000 });
  });
});

describe("expenseSchema.recurring", () => {
  const base = {
    label: "Loyer",
    amount: "1200",
    categoryId: "1",
    memberIds: ["1"],
  };

  test('recurring: "on" (HTML checkbox checked) → 1', () => {
    const r = expenseSchema.safeParse({ ...base, recurring: "on" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.recurring).toBe(1);
  });

  test("recurring field omitted → 0", () => {
    const r = expenseSchema.safeParse({ ...base });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.recurring).toBe(0);
  });

  test('recurring: "1" → 1', () => {
    const r = expenseSchema.safeParse({ ...base, recurring: "1" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.recurring).toBe(1);
  });

  test('recurring: "true" → 1', () => {
    const r = expenseSchema.safeParse({ ...base, recurring: "true" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.recurring).toBe(1);
  });
});
