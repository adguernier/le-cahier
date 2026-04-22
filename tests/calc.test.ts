import { describe, expect, test } from "vitest";
import { calculate, type CalcInput } from "~/lib/calc";

const alice = { id: 1, name: "Alice", income: 200000, costOfLiving: 80000 };
const bob = { id: 2, name: "Bob", income: 100000, costOfLiving: 80000 };

describe("calc — pure proportional", () => {
  test("splits expense proportionally to income", () => {
    const input: CalcInput = {
      members: [alice, bob],
      expenses: [{ id: 1, amount: 60000, memberIds: [1, 2] }],
    };
    const r = calculate(input);
    expect(r.proportional).toEqual([
      { memberId: 1, total: 40000 },
      { memberId: 2, total: 20000 },
    ]);
  });

  test("individual expense (1 member) does not flow into proportional", () => {
    const input: CalcInput = {
      members: [alice, bob],
      expenses: [{ id: 1, amount: 30000, memberIds: [1] }],
    };
    const r = calculate(input);
    expect(r.proportional).toEqual([
      { memberId: 1, total: 0 },
      { memberId: 2, total: 0 },
    ]);
    expect(r.individualTotals).toEqual([
      { memberId: 1, total: 30000 },
      { memberId: 2, total: 0 },
    ]);
  });

  test("equal split when all incomes are zero", () => {
    const input: CalcInput = {
      members: [
        { ...alice, income: 0 },
        { ...bob, income: 0 },
      ],
      expenses: [{ id: 1, amount: 10000, memberIds: [1, 2] }],
    };
    const r = calculate(input);
    expect(r.proportional).toEqual([
      { memberId: 1, total: 5000 },
      { memberId: 2, total: 5000 },
    ]);
  });

  test("negative income is clamped to zero", () => {
    const input: CalcInput = {
      members: [
        { ...alice, income: -5000 },
        bob,
      ],
      expenses: [{ id: 1, amount: 10000, memberIds: [1, 2] }],
    };
    const r = calculate(input);
    expect(r.proportional).toEqual([
      { memberId: 1, total: 0 },
      { memberId: 2, total: 10000 },
    ]);
  });

  test("rounding residual keeps totals consistent", () => {
    const input: CalcInput = {
      members: [alice, bob],
      expenses: [{ id: 1, amount: 10001, memberIds: [1, 2] }],
    };
    const r = calculate(input);
    const sum = r.proportional.reduce((s, p) => s + p.total, 0);
    expect(sum).toBe(10001);
  });
});

describe("calc — after cost-of-living", () => {
  test("splits on capacity (income minus costOfLiving)", () => {
    const input: CalcInput = {
      members: [alice, bob],
      expenses: [{ id: 1, amount: 70000, memberIds: [1, 2] }],
    };
    const r = calculate(input);
    expect(r.afterCostOfLiving).toEqual([
      { memberId: 1, total: 60000 },
      { memberId: 2, total: 10000 },
    ]);
  });

  test("falls back to proportional when all capacities are zero", () => {
    const poor1 = { id: 1, name: "A", income: 50000, costOfLiving: 80000 };
    const poor2 = { id: 2, name: "B", income: 30000, costOfLiving: 80000 };
    const input: CalcInput = {
      members: [poor1, poor2],
      expenses: [{ id: 1, amount: 40000, memberIds: [1, 2] }],
    };
    const r = calculate(input);
    expect(r.afterCostOfLiving).toEqual([
      { memberId: 1, total: 25000 },
      { memberId: 2, total: 15000 },
    ]);
  });

  test("only affected members contribute to capacity sum", () => {
    const carol = { id: 3, name: "Carol", income: 150000, costOfLiving: 80000 };
    const input: CalcInput = {
      members: [alice, bob, carol],
      expenses: [{ id: 1, amount: 80000, memberIds: [1, 3] }],
    };
    const r = calculate(input);
    expect(r.afterCostOfLiving.find((s) => s.memberId === 2)!.total).toBe(0);
    const sum = r.afterCostOfLiving.reduce((s, x) => s + x.total, 0);
    expect(sum).toBe(80000);
  });
});

describe("calc — individual vs common split", () => {
  test("mix of common and individual expenses — common-only shares, per-member individuals", () => {
    const input: CalcInput = {
      members: [alice, bob],
      expenses: [
        { id: 1, amount: 60000, memberIds: [1, 2] }, // common
        { id: 2, amount: 12000, memberIds: [1] },    // individual (Alice)
        { id: 3, amount: 9000, memberIds: [2] },     // individual (Bob)
      ],
    };
    const r = calculate(input);
    expect(r.proportional).toEqual([
      { memberId: 1, total: 40000 },
      { memberId: 2, total: 20000 },
    ]);
    expect(r.individualTotals).toEqual([
      { memberId: 1, total: 12000 },
      { memberId: 2, total: 9000 },
    ]);
  });

  test("only individual expenses — all common shares are zero", () => {
    const input: CalcInput = {
      members: [alice, bob],
      expenses: [{ id: 1, amount: 25000, memberIds: [2] }],
    };
    const r = calculate(input);
    expect(r.proportional).toEqual([
      { memberId: 1, total: 0 },
      { memberId: 2, total: 0 },
    ]);
    expect(r.afterCostOfLiving).toEqual([
      { memberId: 1, total: 0 },
      { memberId: 2, total: 0 },
    ]);
    expect(r.individualTotals).toEqual([
      { memberId: 1, total: 0 },
      { memberId: 2, total: 25000 },
    ]);
  });

  test("only common expenses — individualTotals all zero", () => {
    const input: CalcInput = {
      members: [alice, bob],
      expenses: [{ id: 1, amount: 60000, memberIds: [1, 2] }],
    };
    const r = calculate(input);
    expect(r.individualTotals).toEqual([
      { memberId: 1, total: 0 },
      { memberId: 2, total: 0 },
    ]);
  });

  test("individual expense produces a byExpense entry with full amount for the sole member", () => {
    const input: CalcInput = {
      members: [alice, bob],
      expenses: [{ id: 7, amount: 5000, memberIds: [1] }],
    };
    const r = calculate(input);
    const entry = r.byExpense.find((b) => b.expenseId === 7)!;
    expect(entry.proportional).toEqual([{ memberId: 1, share: 5000 }]);
    expect(entry.afterCostOfLiving).toEqual([{ memberId: 1, share: 5000 }]);
  });
});
