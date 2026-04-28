import { beforeEach, describe, expect, test, vi } from "vitest";
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

import { db } from "~/lib/db.server";
import {
  addExpense,
  applyRollover,
  closeMonth,
  createMember,
  createMonth,
  ensureDraft,
  getMonth,
  getMonthState,
  listActiveMembers,
  listCategories,
  listMonths,
  seedDefaultCategories,
  updateIncome,
} from "~/lib/queries.server";

function setup() {
  seedDefaultCategories();
  const alice = createMember({ name: "Alice", defaultCostOfLiving: 80000 });
  return { alice };
}

describe("applyRollover", () => {
  beforeEach(() => {
    // Each describe gets a fresh mocked in-memory DB at module load.
    // This block is here to document intent; the mock factory above
    // runs once per file so state carries across tests in the file.
  });

  test("DB empty — creates the target month as open with no copy", () => {
    setup();
    applyRollover(new Date(2028, 0, 15)); // 2028-01
    const list = listMonths();
    expect(list).toHaveLength(1);
    expect(list[0].year).toBe(2028);
    expect(list[0].month).toBe(1);
    expect(list[0].status).toBe("open");
  });

  test("latest already matches target — no-op", () => {
    applyRollover(new Date(2028, 0, 20)); // still 2028-01
    const list = listMonths();
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe("open");
  });

  test("normal rollover with existing draft — draft flips to open and previous closes", () => {
    const jan = getMonth(2028, 1)!;
    const alice = listActiveMembers()[0];
    updateIncome(jan.id, alice.id, { amount: 200000, costOfLiving: 80000 });
    const loyer = listCategories().find((c) => c.name === "Loyer")!;
    addExpense(jan.id, {
      label: "Loyer",
      amount: 100000,
      categoryId: loyer.id,
      memberIds: [alice.id],
      recurring: 1,
    });
    // Materialise February draft by ensureDraft (simulating a preview visit).
    ensureDraft(jan.id);
    expect(getMonth(2028, 2)!.status).toBe("draft");

    applyRollover(new Date(2028, 1, 3)); // 2028-02

    expect(getMonth(2028, 1)!.status).toBe("closed");
    expect(getMonth(2028, 2)!.status).toBe("open");
    const feb = getMonth(2028, 2)!;
    const state = getMonthState(feb.id);
    expect(state.expenses).toHaveLength(1);
    expect(state.expenses[0].recurring).toBe(1);
  });

  test("gap-fill creates each missing month closed, target open", () => {
    // Currently at feb open. Advance to may.
    applyRollover(new Date(2028, 4, 10)); // 2028-05

    expect(getMonth(2028, 2)!.status).toBe("closed");
    expect(getMonth(2028, 3)!.status).toBe("closed");
    expect(getMonth(2028, 4)!.status).toBe("closed");
    expect(getMonth(2028, 5)!.status).toBe("open");

    // The gap-filled months should carry recurring expenses from the chain.
    const march = getMonth(2028, 3)!;
    const marchState = getMonthState(march.id);
    expect(marchState.expenses).toHaveLength(1);
    expect(marchState.expenses[0].label).toBe("Loyer");
  });

  test("target already open — no change", () => {
    const before = getMonth(2028, 5)!;
    applyRollover(new Date(2028, 4, 28));
    const after = getMonth(2028, 5)!;
    expect(after.id).toBe(before.id);
    expect(after.status).toBe("open");
  });

  test("target already closed (user pre-closed) — do not reopen", () => {
    const may = getMonth(2028, 5)!;
    closeMonth(may.id);
    applyRollover(new Date(2028, 4, 29));
    expect(getMonth(2028, 5)!.status).toBe("closed");
  });

  test("stale draft strictly before target is closed by the sweep", () => {
    // Insert a draft row for 2028-06 directly (simulating a previewed forecast
    // that was never opened).
    db.insert(schema.months)
      .values({ year: 2028, month: 6, status: "draft" })
      .run();
    expect(getMonth(2028, 6)!.status).toBe("draft");

    // Advance to 2028-08 — June is now strictly before the target.
    applyRollover(new Date(2028, 7, 1)); // 2028-08

    expect(getMonth(2028, 6)!.status).toBe("closed");
    expect(getMonth(2028, 8)!.status).toBe("open");
  });
});
