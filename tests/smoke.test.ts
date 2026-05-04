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

vi.mock("~/lib/session.server", () => ({
  requireAuth: vi.fn().mockResolvedValue(undefined),
}));

import {
  addExpense,
  closeMonth,
  createMember,
  createMonth,
  listCategories,
  seedDefaultCategories,
  updateIncome,
} from "~/lib/queries.server";
import { loader } from "~/routes/month-detail";

let aliceId: number;
let bobId: number;
let monthId: number;

beforeAll(() => {
  seedDefaultCategories();
  const alice = createMember({ name: "Alice", defaultCostOfLiving: 80000 });
  const bob = createMember({ name: "Bob", defaultCostOfLiving: 70000 });
  aliceId = alice.id;
  bobId = bob.id;

  const m = createMonth(2026, 4);
  monthId = m.id;

  updateIncome(m.id, aliceId, { amount: 300000, costOfLiving: 80000 });
  updateIncome(m.id, bobId, { amount: 200000, costOfLiving: 70000 });

  const loyer = listCategories().find((c) => c.name === "Loyer")!;
  addExpense(m.id, {
    label: "Loyer avril",
    amount: 120000,
    categoryId: loyer.id,
    memberIds: [aliceId, bobId],
    recurring: 1,
  });
});

describe("month-detail loader smoke tests", () => {
  test("open month with one recurring common expense — forecast.source === 'computed'", async () => {
    const request = new Request("http://localhost/months/2026-04");
    const result = await loader({
      request,
      params: { yyyymm: "2026-04" },
    } as any);

    expect(result.state.month.status).toBe("open");
    expect(result.forecast).not.toBeNull();
    expect(result.forecast!.source).toBe("computed");
    expect(result.forecast!.recurringCount).toBe(1);
  });

  test("navigating to nextMonth(latestOpen) materialises draft", async () => {
    const request = new Request("http://localhost/months/2026-05");
    const result = await loader({
      request,
      params: { yyyymm: "2026-05" },
    } as any);

    expect(result.state.month.status).toBe("draft");

    const loyerExpense = result.state.expenses.find(
      (e) => e.label === "Loyer avril"
    );
    expect(loyerExpense).toBeDefined();
    expect(loyerExpense!.recurring).toBe(1);

    const aliceIncome = result.state.incomes.find(
      (i) => i.memberId === aliceId
    );
    expect(aliceIncome).toBeDefined();
    expect(aliceIncome!.amount).toBe(300000);

    expect(result.forecast).toBeNull();
  });

  test("far-future month not adjacent to latest open — 404", async () => {
    const request = new Request("http://localhost/months/2030-01");
    let caught: unknown;
    try {
      await loader({ request, params: { yyyymm: "2030-01" } } as any);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Response);
    expect((caught as Response).status).toBe(404);
  });

  test("closed month renders without forecast", async () => {
    closeMonth(monthId);

    const request = new Request("http://localhost/months/2026-04");
    const result = await loader({
      request,
      params: { yyyymm: "2026-04" },
    } as any);

    expect(result.state.month.status).toBe("closed");
    expect(result.forecast).toBeNull();
  });
});
