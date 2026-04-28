import { beforeAll, describe, expect, test, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "~/lib/schema";

vi.mock("~/lib/db.server", () => {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "migrations" });
  return { db };
});

import {
  addExpense,
  archiveMember,
  closeMonth,
  createCategory,
  createMember,
  createMonth,
  deleteCategory,
  deleteExpense,
  duplicateMonth,
  ensureDraft,
  getMonth,
  getForecastInput,
  getMonthState,
  listActiveMembers,
  listCategories,
  listMonths,
  renameCategory,
  seedDefaultCategories,
  updateExpense,
  updateIncome,
} from "~/lib/queries.server";

// --- Members ---

describe("member queries", () => {
  test("listActiveMembers returns []", () => {
    expect(listActiveMembers()).toEqual([]);
  });

  test("createMember then listActiveMembers returns it", () => {
    createMember({ name: "Alice", defaultCostOfLiving: 80000 });
    const rows = listActiveMembers();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Alice");
    expect(rows[0].defaultCostOfLiving).toBe(80000);
  });

  test("archiveMember hides from listActiveMembers", () => {
    const bob = createMember({ name: "Bob", defaultCostOfLiving: 70000 });
    archiveMember(bob.id);
    const names = listActiveMembers().map((m) => m.name);
    expect(names).not.toContain("Bob");
  });
});

// --- Categories ---

describe("category queries", () => {
  beforeAll(() => {
    seedDefaultCategories();
  });

  test("default categories seeded", () => {
    const names = listCategories().map((c) => c.name);
    expect(names).toContain("Loyer");
    expect(names).toContain("Autre");
  });

  test("cannot delete default category", () => {
    const loyer = listCategories().find((c) => c.name === "Loyer")!;
    expect(() => deleteCategory(loyer.id)).toThrow();
  });

  test("custom category CRUD", () => {
    const c = createCategory("Restaurant");
    expect(c.isDefault).toBe(0);
    renameCategory(c.id, "Restos");
    const after = listCategories().find((x) => x.id === c.id)!;
    expect(after.name).toBe("Restos");
    deleteCategory(c.id);
    expect(listCategories().find((x) => x.id === c.id)).toBeUndefined();
  });
});

// --- Months + Expenses ---

describe("month queries", () => {
  let aliceId: number;

  beforeAll(() => {
    // Alice should already exist from member tests above
    const active = listActiveMembers();
    aliceId = active[0].id;
  });

  test("createMonth adds open month with income rows", () => {
    const m = createMonth(2026, 4);
    expect(m.status).toBe("open");
    const state = getMonthState(m.id);
    expect(state.incomes).toHaveLength(1); // Only Alice (Bob is archived)
    expect(state.incomes[0].costOfLiving).toBe(80000);
    expect(state.incomes[0].amount).toBe(0);
  });

  test("cannot create duplicate month", () => {
    expect(() => createMonth(2026, 4)).toThrow();
  });

  test("add and delete expense", () => {
    const m = getMonth(2026, 4)!;
    const cat = listCategories()[0];
    const exp = addExpense(m.id, {
      label: "Loyer",
      amount: 50000,
      categoryId: cat.id,
      memberIds: [aliceId],
    });
    let state = getMonthState(m.id);
    expect(state.expenses).toHaveLength(1);
    expect(state.expenses[0].memberIds).toEqual([aliceId]);
    deleteExpense(exp.id);
    state = getMonthState(m.id);
    expect(state.expenses).toHaveLength(0);
  });

  test("closeMonth flips status", () => {
    const m = getMonth(2026, 4)!;
    closeMonth(m.id);
    expect(getMonth(2026, 4)!.status).toBe("closed");
  });

  test("listMonths returns reverse chronological", () => {
    createMonth(2026, 5);
    const list = listMonths();
    expect(list.map((m) => `${m.year}-${m.month}`)).toEqual([
      "2026-5",
      "2026-4",
    ]);
  });
});

// --- Duplicate month ---

describe("duplicateMonth", () => {
  test("copies incomes and expenses with assignments", () => {
    const src = getMonth(2026, 5)!;
    const active = listActiveMembers();
    const aliceId = active[0].id;
    updateIncome(src.id, aliceId, { amount: 200000, costOfLiving: 85000 });
    const cat = listCategories().find((c) => c.name === "Loyer")!;
    addExpense(src.id, {
      label: "Loyer mai",
      amount: 90000,
      categoryId: cat.id,
      memberIds: [aliceId],
    });

    const june = duplicateMonth(src.id, 2026, 6);
    const state = getMonthState(june.id);
    expect(state.month.status).toBe("open");
    const aliceIncome = state.incomes.find((i) => i.memberId === aliceId)!;
    expect(aliceIncome.amount).toBe(200000);
    expect(aliceIncome.costOfLiving).toBe(85000);
    expect(state.expenses).toHaveLength(1);
    expect(state.expenses[0].label).toBe("Loyer mai");
    expect(state.expenses[0].memberIds).toEqual([aliceId]);
  });
});

// --- recurring flag ---

describe("expense recurring flag", () => {
  test("addExpense persists recurring=1 when provided", () => {
    const m = createMonth(2026, 7);
    const active = listActiveMembers();
    const cat = listCategories().find((c) => c.name === "Loyer")!;
    const exp = addExpense(m.id, {
      label: "Loyer juillet",
      amount: 90000,
      categoryId: cat.id,
      memberIds: [active[0].id],
      recurring: 1,
    });
    const state = getMonthState(m.id);
    const row = state.expenses.find((e) => e.id === exp.id)!;
    expect(row.recurring).toBe(1);
  });

  test("addExpense defaults recurring to 0 when omitted", () => {
    const m = getMonth(2026, 7)!;
    const active = listActiveMembers();
    const cat = listCategories().find((c) => c.name === "Autre")!;
    const exp = addExpense(m.id, {
      label: "Plombier",
      amount: 8000,
      categoryId: cat.id,
      memberIds: [active[0].id],
    });
    const state = getMonthState(m.id);
    const row = state.expenses.find((e) => e.id === exp.id)!;
    expect(row.recurring).toBe(0);
  });

  test("updateExpense can toggle recurring", () => {
    const m = getMonth(2026, 7)!;
    const active = listActiveMembers();
    const cat = listCategories().find((c) => c.name === "Autre")!;
    const exp = addExpense(m.id, {
      label: "Cadeau",
      amount: 4000,
      categoryId: cat.id,
      memberIds: [active[0].id],
      recurring: 0,
    });
    updateExpense(exp.id, {
      label: "Cadeau",
      amount: 4000,
      categoryId: cat.id,
      memberIds: [active[0].id],
      recurring: 1,
    });
    const state = getMonthState(m.id);
    const row = state.expenses.find((e) => e.id === exp.id)!;
    expect(row.recurring).toBe(1);
  });
});

// --- ensureDraft ---

describe("ensureDraft", () => {
  test("creates a draft for the next calendar month seeded with recurring expenses and incomes", () => {
    const m = createMonth(2027, 1);
    const active = listActiveMembers();
    const alice = active[0];
    updateIncome(m.id, alice.id, { amount: 250000, costOfLiving: 90000 });
    const loyer = listCategories().find((c) => c.name === "Loyer")!;
    const autre = listCategories().find((c) => c.name === "Autre")!;
    addExpense(m.id, {
      label: "Loyer janvier",
      amount: 100000,
      categoryId: loyer.id,
      memberIds: [alice.id],
      recurring: 1,
    });
    addExpense(m.id, {
      label: "Plombier",
      amount: 6000,
      categoryId: autre.id,
      memberIds: [alice.id],
      recurring: 0,
    });

    const draft = ensureDraft(m.id);
    expect(draft.year).toBe(2027);
    expect(draft.month).toBe(2);
    expect(draft.status).toBe("draft");

    const state = getMonthState(draft.id);
    expect(state.expenses).toHaveLength(1);
    expect(state.expenses[0].label).toBe("Loyer janvier");
    expect(state.expenses[0].recurring).toBe(1);
    expect(state.expenses[0].memberIds).toEqual([alice.id]);
    const aliceIncome = state.incomes.find((i) => i.memberId === alice.id)!;
    expect(aliceIncome.amount).toBe(250000);
    expect(aliceIncome.costOfLiving).toBe(90000);
  });

  test("ensureDraft is idempotent — returns the same row and does not duplicate", () => {
    const m = getMonth(2027, 1)!;
    const first = ensureDraft(m.id);
    const second = ensureDraft(m.id);
    expect(second.id).toBe(first.id);
    const state = getMonthState(first.id);
    expect(state.expenses).toHaveLength(1);
  });

  test("ensureDraft returns the existing row when the target month is already closed", () => {
    const m = createMonth(2027, 3);
    const existing = ensureDraft(m.id);
    // The target is 2027-04, which does not exist yet → draft created.
    expect(existing.status).toBe("draft");
    // Manually close it, then call ensureDraft again.
    closeMonth(existing.id);
    const again = ensureDraft(m.id);
    expect(again.id).toBe(existing.id);
    expect(again.status).toBe("closed"); // no re-creation, status preserved
  });
});

// --- getForecastInput ---

describe("getForecastInput", () => {
  test("returns only recurring expenses with current-month incomes", () => {
    const m = createMonth(2027, 6);
    const active = listActiveMembers();
    const alice = active[0];
    updateIncome(m.id, alice.id, { amount: 180000, costOfLiving: 70000 });
    const loyer = listCategories().find((c) => c.name === "Loyer")!;
    const autre = listCategories().find((c) => c.name === "Autre")!;
    addExpense(m.id, {
      label: "Loyer",
      amount: 95000,
      categoryId: loyer.id,
      memberIds: [alice.id],
      recurring: 1,
    });
    addExpense(m.id, {
      label: "Ponctuelle",
      amount: 3000,
      categoryId: autre.id,
      memberIds: [alice.id],
      recurring: 0,
    });

    const input = getForecastInput(m.id);
    expect(input.members).toHaveLength(1);
    expect(input.members[0].income).toBe(180000);
    expect(input.expenses).toHaveLength(1);
    expect(input.expenses[0].amount).toBe(95000);
    expect(input.expenses[0].memberIds).toEqual([alice.id]);
  });
});
