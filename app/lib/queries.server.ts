import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./db.server";
import {
  categories,
  expenseMembers,
  expenses,
  members,
  monthlyIncomes,
  months,
} from "./schema";
import { nextMonth as calendarNext, prevMonth } from "./month-utils";
import type { CalcInput } from "./calc";

// --- Members ---

export function listActiveMembers() {
  return db
    .select()
    .from(members)
    .where(isNull(members.archivedAt))
    .orderBy(asc(members.name))
    .all();
}

export function getMember(id: number) {
  return db.select().from(members).where(eq(members.id, id)).get();
}

export function createMember(input: {
  name: string;
  defaultCostOfLiving: number;
}) {
  return db
    .insert(members)
    .values({ name: input.name, defaultCostOfLiving: input.defaultCostOfLiving })
    .returning()
    .get();
}

export function updateMember(
  id: number,
  input: { name: string; defaultCostOfLiving: number }
) {
  return db
    .update(members)
    .set({ name: input.name, defaultCostOfLiving: input.defaultCostOfLiving })
    .where(eq(members.id, id))
    .run();
}

export function archiveMember(id: number) {
  return db
    .update(members)
    .set({ archivedAt: Math.floor(Date.now() / 1000) })
    .where(eq(members.id, id))
    .run();
}

// --- Categories ---

const DEFAULT_CATEGORIES = [
  "Loyer",
  "Électricité",
  "Gaz",
  "Internet",
  "Eau",
  "Courses",
  "Assurance",
  "Autre",
];

export function seedDefaultCategories() {
  for (const name of DEFAULT_CATEGORIES) {
    const existing = db
      .select()
      .from(categories)
      .where(eq(categories.name, name))
      .get();
    if (!existing) {
      db.insert(categories).values({ name, isDefault: 1 }).run();
    }
  }
}

export function listCategories() {
  return db.select().from(categories).orderBy(asc(categories.name)).all();
}

export function createCategory(name: string) {
  return db
    .insert(categories)
    .values({ name, isDefault: 0 })
    .returning()
    .get();
}

export function renameCategory(id: number, name: string) {
  return db.update(categories).set({ name }).where(eq(categories.id, id)).run();
}

export function deleteCategory(id: number) {
  const row = db.select().from(categories).where(eq(categories.id, id)).get();
  if (!row) throw new Error("Category not found");
  if (row.isDefault === 1) throw new Error("Cannot delete default category");
  return db.delete(categories).where(eq(categories.id, id)).run();
}

// --- Months ---

export function listMonths() {
  return db
    .select()
    .from(months)
    .orderBy(asc(months.year), asc(months.month))
    .all()
    .reverse();
}

export function getMonth(year: number, month: number) {
  return db
    .select()
    .from(months)
    .where(and(eq(months.year, year), eq(months.month, month)))
    .get();
}

export function getMonthById(id: number) {
  return db.select().from(months).where(eq(months.id, id)).get();
}

export function createMonth(year: number, month: number) {
  const existing = getMonth(year, month);
  if (existing) throw new Error(`Month ${year}-${month} already exists`);

  const row = db
    .insert(months)
    .values({ year, month, status: "open" })
    .returning()
    .get();

  const activeMembers = listActiveMembers();
  for (const m of activeMembers) {
    db.insert(monthlyIncomes)
      .values({
        monthId: row.id,
        memberId: m.id,
        amount: 0,
        costOfLiving: m.defaultCostOfLiving,
      })
      .run();
  }
  return row;
}

export function closeMonth(id: number) {
  return db
    .update(months)
    .set({ status: "closed" })
    .where(eq(months.id, id))
    .run();
}

// --- Incomes ---

export function updateIncome(
  monthId: number,
  memberId: number,
  input: { amount: number; costOfLiving: number }
) {
  return db
    .update(monthlyIncomes)
    .set(input)
    .where(
      and(
        eq(monthlyIncomes.monthId, monthId),
        eq(monthlyIncomes.memberId, memberId)
      )
    )
    .run();
}

// --- Expenses ---

export function addExpense(
  monthId: number,
  input: {
    label: string;
    amount: number;
    categoryId: number;
    memberIds: number[];
    recurring?: number;
  }
) {
  const exp = db
    .insert(expenses)
    .values({
      monthId,
      label: input.label,
      amount: input.amount,
      categoryId: input.categoryId,
      recurring: input.recurring ?? 0,
    })
    .returning()
    .get();
  for (const mid of input.memberIds) {
    db.insert(expenseMembers)
      .values({ expenseId: exp.id, memberId: mid })
      .run();
  }
  return exp;
}

export function updateExpense(
  id: number,
  input: {
    label: string;
    amount: number;
    categoryId: number;
    memberIds: number[];
    recurring?: number;
  }
) {
  db.update(expenses)
    .set({
      label: input.label,
      amount: input.amount,
      categoryId: input.categoryId,
      recurring: input.recurring ?? 0,
    })
    .where(eq(expenses.id, id))
    .run();
  db.delete(expenseMembers).where(eq(expenseMembers.expenseId, id)).run();
  for (const mid of input.memberIds) {
    db.insert(expenseMembers)
      .values({ expenseId: id, memberId: mid })
      .run();
  }
}

export function deleteExpense(id: number) {
  return db.delete(expenses).where(eq(expenses.id, id)).run();
}

// --- Full month state ---

export type MonthState = {
  month: {
    id: number;
    year: number;
    month: number;
    status: "draft" | "open" | "closed";
  };
  incomes: {
    memberId: number;
    name: string;
    amount: number;
    costOfLiving: number;
  }[];
  expenses: {
    id: number;
    label: string;
    amount: number;
    categoryId: number;
    categoryName: string;
    memberIds: number[];
    recurring: number;
  }[];
};

export function getMonthState(monthId: number): MonthState {
  const m = getMonthById(monthId);
  if (!m) throw new Error("Month not found");

  if (m.status === "open") {
    const existing = db
      .select({ memberId: monthlyIncomes.memberId })
      .from(monthlyIncomes)
      .where(eq(monthlyIncomes.monthId, monthId))
      .all();
    const existingIds = new Set(existing.map((r) => r.memberId));
    for (const mem of listActiveMembers()) {
      if (existingIds.has(mem.id)) continue;
      db.insert(monthlyIncomes)
        .values({
          monthId,
          memberId: mem.id,
          amount: 0,
          costOfLiving: mem.defaultCostOfLiving,
        })
        .run();
    }
  }

  const incomeRows = db
    .select({
      memberId: monthlyIncomes.memberId,
      name: members.name,
      amount: monthlyIncomes.amount,
      costOfLiving: monthlyIncomes.costOfLiving,
    })
    .from(monthlyIncomes)
    .innerJoin(members, eq(members.id, monthlyIncomes.memberId))
    .where(eq(monthlyIncomes.monthId, monthId))
    .orderBy(asc(members.name))
    .all();

  const expenseRows = db
    .select({
      id: expenses.id,
      label: expenses.label,
      amount: expenses.amount,
      categoryId: expenses.categoryId,
      categoryName: categories.name,
      recurring: expenses.recurring,
    })
    .from(expenses)
    .innerJoin(categories, eq(categories.id, expenses.categoryId))
    .where(eq(expenses.monthId, monthId))
    .orderBy(asc(expenses.id))
    .all();

  // Fetch all assignments for this month's expenses
  const expenseIds = expenseRows.map((e) => e.id);
  const allAssignments =
    expenseIds.length > 0
      ? db.select().from(expenseMembers).all()
      : [];

  const expenseIdSet = new Set(expenseIds);
  const assignByExpense = new Map<number, number[]>();
  for (const a of allAssignments) {
    if (!expenseIdSet.has(a.expenseId)) continue;
    const list = assignByExpense.get(a.expenseId) ?? [];
    list.push(a.memberId);
    assignByExpense.set(a.expenseId, list);
  }

  return {
    month: {
      id: m.id,
      year: m.year,
      month: m.month,
      status: m.status as "draft" | "open" | "closed",
    },
    incomes: incomeRows,
    expenses: expenseRows.map((e) => ({
      ...e,
      memberIds: (assignByExpense.get(e.id) ?? []).sort((a, b) => a - b),
    })),
  };
}

// --- Duplicate month ---

export function duplicateMonth(
  sourceMonthId: number,
  newYear: number,
  newMonth: number
) {
  const existing = getMonth(newYear, newMonth);
  if (existing) throw new Error(`Month ${newYear}-${newMonth} already exists`);

  const newRow = db
    .insert(months)
    .values({ year: newYear, month: newMonth, status: "open" })
    .returning()
    .get();

  const active = new Set(listActiveMembers().map((m) => m.id));

  // Copy incomes from source month (active members only)
  const srcIncomes = db
    .select()
    .from(monthlyIncomes)
    .where(eq(monthlyIncomes.monthId, sourceMonthId))
    .all();
  for (const i of srcIncomes) {
    if (!active.has(i.memberId)) continue;
    db.insert(monthlyIncomes)
      .values({
        monthId: newRow.id,
        memberId: i.memberId,
        amount: i.amount,
        costOfLiving: i.costOfLiving,
      })
      .run();
  }

  // Add rows for members added after source month
  for (const mid of active) {
    const already = srcIncomes.find((r) => r.memberId === mid);
    if (already) continue;
    const m = getMember(mid)!;
    db.insert(monthlyIncomes)
      .values({
        monthId: newRow.id,
        memberId: mid,
        amount: 0,
        costOfLiving: m.defaultCostOfLiving,
      })
      .run();
  }

  // Copy expenses + assignments
  const srcExpenses = db
    .select()
    .from(expenses)
    .where(eq(expenses.monthId, sourceMonthId))
    .all();
  for (const e of srcExpenses) {
    const newExp = db
      .insert(expenses)
      .values({
        monthId: newRow.id,
        categoryId: e.categoryId,
        label: e.label,
        amount: e.amount,
      })
      .returning()
      .get();
    const assigns = db
      .select()
      .from(expenseMembers)
      .where(eq(expenseMembers.expenseId, e.id))
      .all();
    for (const a of assigns) {
      if (!active.has(a.memberId)) continue;
      db.insert(expenseMembers)
        .values({ expenseId: newExp.id, memberId: a.memberId })
        .run();
    }
  }

  return newRow;
}

// --- Draft for the next calendar month ---

export function ensureDraft(currentMonthId: number) {
  const current = getMonthById(currentMonthId);
  if (!current) throw new Error("Month not found");

  const { year: nextYear, month: nextMo } = calendarNext(
    current.year,
    current.month
  );
  const existing = getMonth(nextYear, nextMo);
  if (existing) return existing;

  const active = new Set(listActiveMembers().map((m) => m.id));

  const srcIncomes = db
    .select()
    .from(monthlyIncomes)
    .where(eq(monthlyIncomes.monthId, currentMonthId))
    .all();

  const recurringSrc = db
    .select()
    .from(expenses)
    .where(
      and(eq(expenses.monthId, currentMonthId), eq(expenses.recurring, 1))
    )
    .all();

  return db.transaction((tx) => {
    const draft = tx
      .insert(months)
      .values({ year: nextYear, month: nextMo, status: "draft" })
      .returning()
      .get();

    for (const i of srcIncomes) {
      if (!active.has(i.memberId)) continue;
      tx.insert(monthlyIncomes)
        .values({
          monthId: draft.id,
          memberId: i.memberId,
          amount: i.amount,
          costOfLiving: i.costOfLiving,
        })
        .run();
    }

    for (const e of recurringSrc) {
      const newExp = tx
        .insert(expenses)
        .values({
          monthId: draft.id,
          categoryId: e.categoryId,
          label: e.label,
          amount: e.amount,
          recurring: 1,
        })
        .returning()
        .get();
      const assigns = tx
        .select()
        .from(expenseMembers)
        .where(eq(expenseMembers.expenseId, e.id))
        .all();
      for (const a of assigns) {
        if (!active.has(a.memberId)) continue;
        tx.insert(expenseMembers)
          .values({ expenseId: newExp.id, memberId: a.memberId })
          .run();
      }
    }

    return draft;
  });
}

// --- Rollover at calendar change ---

export function applyRollover(today: Date): void {
  const targetYear = today.getFullYear();
  const targetMonth = today.getMonth() + 1;

  const all = db
    .select()
    .from(months)
    .orderBy(asc(months.year), asc(months.month))
    .all();

  if (all.length === 0) {
    createMonth(targetYear, targetMonth);
    return;
  }

  const latest = all[all.length - 1];

  // Walk from nextMonth(latest) up to target, creating closed intermediates.
  let cursor = calendarNext(latest.year, latest.month);
  while (
    cursor.year < targetYear ||
    (cursor.year === targetYear && cursor.month < targetMonth)
  ) {
    if (!getMonth(cursor.year, cursor.month)) {
      const { year: prevYear, month: prevMo } = prevMonth(
        cursor.year,
        cursor.month
      );
      const prev = getMonth(prevYear, prevMo);
      if (prev) {
        const created = ensureDraft(prev.id);
        db.update(months)
          .set({ status: "closed" })
          .where(eq(months.id, created.id))
          .run();
      } else {
        // Should not happen: latest exists → previous always exists for the
        // first intermediate, and ensureDraft seeds the chain forward.
        createMonth(cursor.year, cursor.month);
        const row = getMonth(cursor.year, cursor.month)!;
        db.update(months)
          .set({ status: "closed" })
          .where(eq(months.id, row.id))
          .run();
      }
    }
    cursor = calendarNext(cursor.year, cursor.month);
  }

  // Ensure target exists. If absent, create via ensureDraft from the previous
  // month (which, after the walk, is guaranteed to exist). If present as
  // draft, flip to open. If present as open/closed, leave alone.
  const target = getMonth(targetYear, targetMonth);
  if (!target) {
    const { year: prevYear, month: prevMo } = prevMonth(
      targetYear,
      targetMonth
    );
    const prev = getMonth(prevYear, prevMo);
    if (prev) {
      const created = ensureDraft(prev.id);
      db.update(months)
        .set({ status: "open" })
        .where(eq(months.id, created.id))
        .run();
    } else {
      createMonth(targetYear, targetMonth);
    }
  } else if (target.status === "draft") {
    db.update(months)
      .set({ status: "open" })
      .where(eq(months.id, target.id))
      .run();
  }

  // Close any open or draft month strictly before target.
  const stale = db
    .select()
    .from(months)
    .where(inArray(months.status, ["open", "draft"]))
    .all();
  for (const m of stale) {
    if (
      m.year < targetYear ||
      (m.year === targetYear && m.month < targetMonth)
    ) {
      db.update(months)
        .set({ status: "closed" })
        .where(eq(months.id, m.id))
        .run();
    }
  }
}

export type ForecastInput = CalcInput;

export function getForecastInput(currentMonthId: number): ForecastInput {
  const incomes = db
    .select({
      memberId: monthlyIncomes.memberId,
      name: members.name,
      amount: monthlyIncomes.amount,
      costOfLiving: monthlyIncomes.costOfLiving,
    })
    .from(monthlyIncomes)
    .innerJoin(members, eq(members.id, monthlyIncomes.memberId))
    .where(eq(monthlyIncomes.monthId, currentMonthId))
    .orderBy(asc(members.name))
    .all();

  const expenseRows = db
    .select({
      id: expenses.id,
      amount: expenses.amount,
    })
    .from(expenses)
    .where(
      and(eq(expenses.monthId, currentMonthId), eq(expenses.recurring, 1))
    )
    .orderBy(asc(expenses.id))
    .all();

  const expenseIds = expenseRows.map((r) => r.id);
  const assigns =
    expenseIds.length > 0
      ? db
          .select()
          .from(expenseMembers)
          .where(inArray(expenseMembers.expenseId, expenseIds))
          .all()
      : [];
  const byExpense = new Map<number, number[]>();
  for (const a of assigns) {
    const list = byExpense.get(a.expenseId) ?? [];
    list.push(a.memberId);
    byExpense.set(a.expenseId, list);
  }

  return {
    members: incomes.map((i) => ({
      id: i.memberId,
      name: i.name,
      income: i.amount,
      costOfLiving: i.costOfLiving,
    })),
    expenses: expenseRows.map((e) => ({
      id: e.id,
      amount: e.amount,
      memberIds: (byExpense.get(e.id) ?? []).sort((a, b) => a - b),
    })),
  };
}
