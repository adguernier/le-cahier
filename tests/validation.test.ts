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
