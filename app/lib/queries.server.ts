import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "./db.server";
import {
  categories,
  expenseMembers,
  expenses,
  members,
  monthlyIncomes,
  months,
} from "./schema";

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
