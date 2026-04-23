# Next-Month Forecast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a draft next-month workflow so members can see and edit a forecast during the current month, backed by a new per-expense `recurring` flag and automatic calendar rollover.

**Architecture:** Pure-function changes in `app/lib/queries.server.ts` (new `ensureDraft`, `getForecastInput`, `applyRollover`) and schema (new `recurring` column + widened `status` enum). `home.tsx` calls `applyRollover(today)` before redirect. `month-detail.tsx` loader materialises the draft when navigating to the next calendar month and renders a read-only preview block on the current open month.

**Tech Stack:** TypeScript, React Router v7 (framework mode), Drizzle ORM + better-sqlite3, Vitest, Tailwind CSS, Zod.

**Spec:** [docs/superpowers/specs/2026-04-23-next-month-forecast-design.md](../specs/2026-04-23-next-month-forecast-design.md)

---

## File Structure

**Modify:**
- `app/lib/schema.ts` — widen `months.status` enum, add `expenses.recurring` column.
- `app/lib/validation.ts` — accept optional `recurring` on the expense schema.
- `app/lib/queries.server.ts` — extend `addExpense`/`updateExpense` input and `MonthState.expenses[]` shape with `recurring`; add `ensureDraft`, `getForecastInput`, `applyRollover`.
- `app/routes/home.tsx` — call `applyRollover(new Date())`; remove the ad-hoc `createMonth` branch now that `applyRollover` handles it.
- `app/routes/month-detail.tsx` — loader calls `ensureDraft` for adjacent-future URLs, loads forecast input for preview; UI gains the recurring checkbox in the add-expense form, a recurring marker in expense rows, a preview block on open months, and branches on `status === "draft"` to hide close/duplicate actions and switch the eyebrow label.
- `app/components/month-status-badge.tsx` — accept `"draft"` and render "Brouillon".

**Create:**
- `migrations/0001_add_recurring_and_draft.sql` (generated via `npm run db:generate`).
- `tests/rollover.test.ts` — unit tests for `applyRollover`.

**No files are removed in this plan.** `duplicateMonth` stays in `queries.server.ts` as a dormant primitive (per spec §9).

---

## Task 1: Schema migration — `recurring` column + widened `status` enum

**Files:**
- Modify: `app/lib/schema.ts`
- Create: `migrations/XXXX_*.sql` (drizzle-kit picks the name)

### Step 1: Widen `months.status` enum and add `expenses.recurring`

- [ ] Edit `app/lib/schema.ts`. In the `months` table definition (lines 32–45), replace:

```ts
    status: text("status", { enum: ["open", "closed"] })
      .notNull()
      .default("open"),
```

with:

```ts
    status: text("status", { enum: ["draft", "open", "closed"] })
      .notNull()
      .default("open"),
```

- [ ] In the `expenses` table definition (lines 64–74), add a `recurring` column so the block reads:

```ts
export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  monthId: integer("month_id")
    .notNull()
    .references(() => months.id, { onDelete: "cascade" }),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id),
  label: text("label").notNull(),
  amount: integer("amount").notNull(),
  recurring: integer("recurring").notNull().default(0),
});
```

### Step 2: Generate the migration

- [ ] Run: `npm run db:generate`

Expected: a new SQL file appears under `migrations/` (e.g. `0001_*.sql`) adding the `recurring` column. Open it and verify it contains roughly:

```sql
ALTER TABLE `expenses` ADD `recurring` integer DEFAULT 0 NOT NULL;
```

The migration should **not** touch `months` (widening the TypeScript enum does not produce SQL because there is no CHECK constraint). If drizzle-kit generated DDL for `months`, review and, if it's a harmless no-op CHECK, accept; otherwise roll back the `months` enum change and re-run (unlikely — verified against the current config).

### Step 3: Apply the migration

- [ ] Run: `npm run db:migrate`

Expected: migration applies without error.

### Step 4: Typecheck

- [ ] Run: `npm run typecheck`

Expected: no errors (the schema widening is additive; no consumer has narrowed on `"open" | "closed"` outside the badge component, which we update in Task 7).

Note: TypeScript may still type-check clean at this point because the badge component uses the loose structural type via `useLoaderData`. We address the badge in Task 7.

### Step 5: Commit

- [ ] Stage and commit:

```bash
git add app/lib/schema.ts migrations/
git commit -m "feat(schema): add expenses.recurring and draft month status"
```

---

## Task 2: Persist `recurring` through `addExpense`/`updateExpense` and expose it in `MonthState`

**Files:**
- Modify: `app/lib/validation.ts`
- Modify: `app/lib/queries.server.ts`
- Test: `tests/queries.test.ts`

### Step 1: Extend `expenseSchema`

- [ ] Edit `app/lib/validation.ts`. Replace the `expenseSchema` block (lines 29–36):

```ts
export const expenseSchema = z.object({
  label: z.string().trim().min(1, "Libellé requis"),
  amount: money,
  categoryId: z.coerce.number().int().positive(),
  memberIds: z
    .array(z.coerce.number().int().positive())
    .min(1, "Au moins un membre"),
});
```

with:

```ts
export const expenseSchema = z.object({
  label: z.string().trim().min(1, "Libellé requis"),
  amount: money,
  categoryId: z.coerce.number().int().positive(),
  memberIds: z
    .array(z.coerce.number().int().positive())
    .min(1, "Au moins un membre"),
  recurring: z
    .union([z.literal("on"), z.literal("true"), z.literal("1"), z.literal("")])
    .optional()
    .transform((v) => (v === "on" || v === "true" || v === "1" ? 1 : 0)),
});
```

The transform handles both the HTML-form checkbox (which submits `"on"` when checked and omits the field when unchecked, producing `undefined`) and explicit values we may use in tests.

### Step 2: Write failing query tests for the `recurring` round-trip

- [ ] At the end of `tests/queries.test.ts`, append:

```ts
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
```

- [ ] Also import `updateExpense` at the top of the file. Replace the import block (lines 15–33):

```ts
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
  getMonth,
  getMonthState,
  listActiveMembers,
  listCategories,
  listMonths,
  renameCategory,
  seedDefaultCategories,
  updateIncome,
} from "~/lib/queries.server";
```

with:

```ts
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
  getMonth,
  getMonthState,
  listActiveMembers,
  listCategories,
  listMonths,
  renameCategory,
  seedDefaultCategories,
  updateExpense,
  updateIncome,
} from "~/lib/queries.server";
```

### Step 3: Run the failing tests

- [ ] Run: `npm test -- tests/queries.test.ts`

Expected: the three new "expense recurring flag" tests fail (either TypeScript errors on `recurring:` in the input shape, or `row.recurring` is `undefined`).

### Step 4: Extend `addExpense` and `updateExpense` signatures

- [ ] Edit `app/lib/queries.server.ts`. Replace the `addExpense` function (around lines 182–207):

```ts
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
```

- [ ] Replace `updateExpense` (around lines 209–232):

```ts
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
```

### Step 5: Expose `recurring` in `MonthState`

- [ ] In `app/lib/queries.server.ts`, update the `MonthState` type (around lines 240–261) so `expenses[]` includes `recurring`:

```ts
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
```

- [ ] In `getMonthState`, update the `expenseRows` select (around lines 300–312) to include the column:

```ts
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
```

The downstream `state.expenses.map((e) => ({ ...e, memberIds: … }))` already spreads every column, so `recurring` flows through automatically.

- [ ] Also update the `month.status` cast (around line 335) so the assertion includes `"draft"`:

```ts
      status: m.status as "draft" | "open" | "closed",
```

### Step 6: Run tests to verify

- [ ] Run: `npm test -- tests/queries.test.ts`

Expected: all tests pass (new three plus existing).

### Step 7: Typecheck

- [ ] Run: `npm run typecheck`

Expected: no errors. The `action` handler in `month-detail.tsx` already forwards `parsed.data` (now including `recurring`) to `addExpense`/`updateExpense`; type inference widens automatically.

### Step 8: Commit

- [ ] Stage and commit:

```bash
git add app/lib/validation.ts app/lib/queries.server.ts tests/queries.test.ts
git commit -m "feat(expenses): persist recurring flag through queries and schema"
```

---

## Task 3: `ensureDraft` and `getForecastInput` in `queries.server.ts`

**Files:**
- Modify: `app/lib/queries.server.ts`
- Test: `tests/queries.test.ts`

### Step 1: Write failing tests for `ensureDraft`

- [ ] Append to `tests/queries.test.ts`:

```ts
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
```

- [ ] Add to the import block at the top of `tests/queries.test.ts`:

```ts
  ensureDraft,
  getForecastInput,
```

(Alphabetical placement between `duplicateMonth` and `getMonth` / after `getMonth` respectively — keep sorted for readability.)

### Step 2: Run failing tests

- [ ] Run: `npm test -- tests/queries.test.ts`

Expected: TypeScript errors / runtime errors for undefined `ensureDraft` and `getForecastInput`.

### Step 3: Implement `ensureDraft`

- [ ] In `app/lib/queries.server.ts`, add near the other month helpers (after `duplicateMonth`, end of file). Also import `nextMonth` at the top:

Top of file, update imports:

```ts
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
import { nextMonth as calendarNext } from "./month-utils";
```

At the end of the file:

```ts
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

  const draft = db
    .insert(months)
    .values({ year: nextYear, month: nextMo, status: "draft" })
    .returning()
    .get();

  const active = new Set(listActiveMembers().map((m) => m.id));

  const srcIncomes = db
    .select()
    .from(monthlyIncomes)
    .where(eq(monthlyIncomes.monthId, currentMonthId))
    .all();
  for (const i of srcIncomes) {
    if (!active.has(i.memberId)) continue;
    db.insert(monthlyIncomes)
      .values({
        monthId: draft.id,
        memberId: i.memberId,
        amount: i.amount,
        costOfLiving: i.costOfLiving,
      })
      .run();
  }

  const recurringSrc = db
    .select()
    .from(expenses)
    .where(
      and(eq(expenses.monthId, currentMonthId), eq(expenses.recurring, 1))
    )
    .all();
  for (const e of recurringSrc) {
    const newExp = db
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

  return draft;
}
```

### Step 4: Implement `getForecastInput`

- [ ] After `ensureDraft`, still in `app/lib/queries.server.ts`, add:

```ts
export type ForecastInput = {
  members: { id: number; name: string; income: number; costOfLiving: number }[];
  expenses: { id: number; amount: number; memberIds: number[] }[];
};

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

  const assigns = db.select().from(expenseMembers).all();
  const memberIdSet = new Set(expenseRows.map((r) => r.id));
  const byExpense = new Map<number, number[]>();
  for (const a of assigns) {
    if (!memberIdSet.has(a.expenseId)) continue;
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
```

### Step 5: Run tests to verify pass

- [ ] Run: `npm test -- tests/queries.test.ts`

Expected: all tests pass, including the new `ensureDraft` and `getForecastInput` suites.

### Step 6: Typecheck

- [ ] Run: `npm run typecheck`

Expected: no errors.

### Step 7: Commit

- [ ] Stage and commit:

```bash
git add app/lib/queries.server.ts tests/queries.test.ts
git commit -m "feat(queries): add ensureDraft and getForecastInput"
```

---

## Task 4: `applyRollover` with gap-fill

**Files:**
- Modify: `app/lib/queries.server.ts`
- Create: `tests/rollover.test.ts`

### Step 1: Write failing tests for `applyRollover`

- [ ] Create `tests/rollover.test.ts` with the following contents:

```ts
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
    const { members: _ignore } = { members: listActiveMembers() };
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
});
```

### Step 2: Run failing tests

- [ ] Run: `npm test -- tests/rollover.test.ts`

Expected: TypeScript / runtime errors — `applyRollover` not exported.

### Step 3: Implement `applyRollover`

- [ ] At the end of `app/lib/queries.server.ts`, add:

```ts
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
      const prev = getMonth(
        cursor.month === 1 ? cursor.year - 1 : cursor.year,
        cursor.month === 1 ? 12 : cursor.month - 1
      );
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
    const prev = getMonth(
      targetMonth === 1 ? targetYear - 1 : targetYear,
      targetMonth === 1 ? 12 : targetMonth - 1
    );
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

  // Close any open month strictly before target.
  const openBefore = db
    .select()
    .from(months)
    .where(eq(months.status, "open"))
    .all();
  for (const m of openBefore) {
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
```

### Step 4: Run tests to verify pass

- [ ] Run: `npm test -- tests/rollover.test.ts`

Expected: all six `applyRollover` tests pass.

### Step 5: Full test suite

- [ ] Run: `npm test`

Expected: all suites pass.

### Step 6: Typecheck

- [ ] Run: `npm run typecheck`

Expected: no errors.

### Step 7: Commit

- [ ] Stage and commit:

```bash
git add app/lib/queries.server.ts tests/rollover.test.ts
git commit -m "feat(queries): add applyRollover with gap-fill"
```

---

## Task 5: Wire `applyRollover` into `home.tsx`

**Files:**
- Modify: `app/routes/home.tsx`

### Step 1: Replace the loader body

- [ ] Replace `app/routes/home.tsx` contents (entire file) with:

```ts
import { redirect } from "react-router";
import type { Route } from "./+types/home";
import { requireAuth } from "~/lib/session.server";
import { applyRollover, listMonths } from "~/lib/queries.server";
import { formatYyyyMm } from "~/lib/month-utils";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);

  applyRollover(new Date());

  const all = listMonths();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const current = all.find((m) => m.year === year && m.month === month);
  const target = current ?? all[0];
  throw redirect(`/months/${formatYyyyMm(target.year, target.month)}`);
}

export default function Home() {
  return null;
}
```

Rationale: `applyRollover` guarantees that either the current calendar month exists (as `open` or `closed`) or — in the exceptional case of a user with an earlier `closed` month and no activity — the latest month takes over. `all[0]` is the most recent month because `listMonths` returns reverse-chronological.

### Step 2: Typecheck

- [ ] Run: `npm run typecheck`

Expected: no errors.

### Step 3: Run full test suite

- [ ] Run: `npm test`

Expected: all suites pass.

### Step 4: Commit

- [ ] Stage and commit:

```bash
git add app/routes/home.tsx
git commit -m "feat(home): apply rollover before redirecting to current month"
```

---

## Task 6: `MonthStatusBadge` supports `"draft"`

**Files:**
- Modify: `app/components/month-status-badge.tsx`

### Step 1: Replace the badge component

- [ ] Replace `app/components/month-status-badge.tsx` with:

```tsx
import { Badge } from "~/components/ui/badge";

export function MonthStatusBadge({
  status,
}: {
  status: "draft" | "open" | "closed";
}) {
  if (status === "draft") {
    return <Badge variant="outline">Brouillon</Badge>;
  }
  return status === "open" ? (
    <Badge variant="accent">Mois ouvert</Badge>
  ) : (
    <Badge variant="outline">Mois clôturé</Badge>
  );
}
```

(The `outline` variant visually matches "closed" — a muted, low-emphasis pill. Design fine-tuning is deferred per spec §11; a dedicated variant can be introduced later without changing callers.)

### Step 2: Typecheck

- [ ] Run: `npm run typecheck`

Expected: no errors. Both existing call sites (`months.tsx` and `month-detail.tsx`) pass `state.month.status` / `r.status`, which now carries the widened union from the schema.

### Step 3: Commit

- [ ] Stage and commit:

```bash
git add app/components/month-status-badge.tsx
git commit -m "feat(ui): month status badge handles draft state"
```

---

## Task 7: `month-detail` loader — `ensureDraft` + forecast input

**Files:**
- Modify: `app/routes/month-detail.tsx`

### Step 1: Extend the loader

- [ ] Replace the existing `loader` function (lines 34–60 of `app/routes/month-detail.tsx`) with:

```ts
export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);
  const { year, month } = parseYyyyMm(params.yyyymm!);

  let m = getMonth(year, month);

  // If the URL is the calendar-next month of the latest open month and no
  // row exists yet, materialise the draft now.
  if (!m) {
    const openMonths = listMonths().filter((x) => x.status === "open");
    const latestOpen = openMonths[0]; // listMonths is reverse chronological
    if (latestOpen) {
      const adjacent = nextMonth(latestOpen.year, latestOpen.month);
      if (adjacent.year === year && adjacent.month === month) {
        ensureDraft(latestOpen.id);
        m = getMonth(year, month);
      }
    }
  }

  if (!m) throw new Response("Month not found", { status: 404 });

  const state = getMonthState(m.id);
  const membersList = listActiveMembers();
  const cats = listCategories();

  const calcInput = {
    members: state.incomes.map((i) => ({
      id: i.memberId,
      name: i.name,
      income: i.amount,
      costOfLiving: i.costOfLiving,
    })),
    expenses: state.expenses.map((e) => ({
      id: e.id,
      amount: e.amount,
      memberIds: e.memberIds,
    })),
  };
  const results = calculate(calcInput);

  // Build the forecast preview data for open months.
  let forecast:
    | {
        year: number;
        month: number;
        source: "draft" | "computed";
        result: ReturnType<typeof calculate>;
        recurringCount: number;
      }
    | null = null;

  if (m.status === "open") {
    const next = nextMonth(year, month);
    const existingDraft = getMonth(next.year, next.month);
    if (existingDraft) {
      const draftState = getMonthState(existingDraft.id);
      const draftInput = {
        members: draftState.incomes.map((i) => ({
          id: i.memberId,
          name: i.name,
          income: i.amount,
          costOfLiving: i.costOfLiving,
        })),
        expenses: draftState.expenses.map((e) => ({
          id: e.id,
          amount: e.amount,
          memberIds: e.memberIds,
        })),
      };
      forecast = {
        year: next.year,
        month: next.month,
        source: "draft",
        result: calculate(draftInput),
        recurringCount: draftState.expenses.filter(
          (e) => e.recurring === 1 && e.memberIds.length >= 2
        ).length,
      };
    } else {
      const input = getForecastInput(m.id);
      const recurringCount = input.expenses.filter(
        (e) => e.memberIds.length >= 2
      ).length;
      forecast = {
        year: next.year,
        month: next.month,
        source: "computed",
        result: calculate(input),
        recurringCount,
      };
    }
  }

  return {
    state,
    members: membersList,
    categories: cats,
    results,
    forecast,
  };
}
```

- [ ] Update the top-level import of `queries.server` helpers to include `ensureDraft`, `getForecastInput`, and `listMonths`. Replace the import block (lines 12–23):

```ts
import {
  addExpense,
  closeMonth,
  deleteExpense,
  duplicateMonth,
  ensureDraft,
  getForecastInput,
  getMonth,
  getMonthState,
  listActiveMembers,
  listCategories,
  listMonths,
  updateExpense,
  updateIncome,
} from "~/lib/queries.server";
```

Also note: the local variable was renamed `members` → `membersList` in the loader to avoid shadowing. The destructuring in the default export currently reads `members` — we update it in the next step.

### Step 2: Update destructuring in the default export

- [ ] In `app/routes/month-detail.tsx`, locate the component body (line 131):

```tsx
  const { state, members, categories, results } =
    useLoaderData<typeof loader>();
```

Replace with:

```tsx
  const { state, members, categories, results, forecast } =
    useLoaderData<typeof loader>();
```

(The loader now returns an object with `members` keyed from `membersList`; in JS we'd write `{ state, members: membersList, … }` but TypeScript infers the shape. Double-check the loader returns `members: membersList` — adjust the return statement accordingly.)

- [ ] Adjust the loader's return block to keep the `members` key name:

```ts
  return {
    state,
    members: membersList,
    categories: cats,
    results,
    forecast,
  };
```

### Step 3: Typecheck

- [ ] Run: `npm run typecheck`

Expected: no errors.

### Step 4: Run full test suite

- [ ] Run: `npm test`

Expected: all suites pass (no UI tests exist that would exercise `forecast`; loader returns are validated at typecheck and runtime via browser smoke in Task 9).

### Step 5: Commit

- [ ] Stage and commit:

```bash
git add app/routes/month-detail.tsx
git commit -m "feat(month-detail): loader materialises draft and builds forecast input"
```

---

## Task 8: Expense form + row — `recurring` checkbox and marker

**Files:**
- Modify: `app/routes/month-detail.tsx`

### Step 1: Add the "Récurrente" checkbox to the add-expense form

- [ ] Locate `AddExpenseForm` (line 445). Inside the `<fieldset>…Concernés</fieldset>` block, add a second row below it. Replace the `<fieldset className="sm:col-span-4">` block (lines 523–542) with:

```tsx
      <fieldset className="sm:col-span-4">
        <legend className="eyebrow mb-2">Concernés</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {incomes.map((i) => (
            <label
              key={i.memberId}
              className="inline-flex items-center gap-2 text-sm text-ink"
            >
              <input
                type="checkbox"
                name="memberIds"
                value={i.memberId}
                defaultChecked
                className="size-3.5 accent-ink"
              />
              {i.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="sm:col-span-4">
        <label className="inline-flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="recurring"
            value="on"
            className="size-3.5 accent-ink"
          />
          <span>
            Récurrente
            <span className="ml-2 text-xs text-ink-soft">
              (sera copiée dans le prévisionnel du mois suivant)
            </span>
          </span>
        </label>
      </div>
```

### Step 2: Display a recurring marker on each expense row

- [ ] In `ExpenseSubList` (around line 593), locate the row rendering (lines 625–647) and replace:

```tsx
          {expenses.map((e) => (
            <li
              key={e.id}
              className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-6 gap-y-1 py-3 sm:grid-cols-[10ch_1fr_auto_auto]"
            >
              <span className="eyebrow">{e.categoryName}</span>
              <span className="text-ink">{e.label}</span>
              <span className="num text-right text-ink">
                {formatEuros(e.amount)}
              </span>
              <div className="col-span-3 flex flex-wrap items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
                <span className="text-xs text-ink-soft sm:mr-4">
                  {e.memberIds
                    .map((id) => memberById.get(id)?.name)
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {!isClosed && <DeleteExpenseButton id={e.id} />}
              </div>
            </li>
          ))}
```

with:

```tsx
          {expenses.map((e) => (
            <li
              key={e.id}
              className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-6 gap-y-1 py-3 sm:grid-cols-[10ch_1fr_auto_auto]"
            >
              <span className="eyebrow">{e.categoryName}</span>
              <span className="text-ink">
                {e.label}
                {e.recurring === 1 && (
                  <span
                    className="ml-2 text-xs text-ink-soft"
                    title="Dépense récurrente — reportée dans le prévisionnel"
                    aria-label="récurrente"
                  >
                    ↻
                  </span>
                )}
              </span>
              <span className="num text-right text-ink">
                {formatEuros(e.amount)}
              </span>
              <div className="col-span-3 flex flex-wrap items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
                <span className="text-xs text-ink-soft sm:mr-4">
                  {e.memberIds
                    .map((id) => memberById.get(id)?.name)
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {!isClosed && <DeleteExpenseButton id={e.id} />}
              </div>
            </li>
          ))}
```

- [ ] Do the same for the inner loop of `IndividualExpensesByMember` (around lines 712–742). Replace the `li` body:

```tsx
                  {g.items.map((e) => (
                    <li
                      key={e.id}
                      className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-6 gap-y-1 py-3 sm:grid-cols-[10ch_1fr_auto_auto]"
                    >
                      <span className="eyebrow">{e.categoryName}</span>
                      <span className="text-ink">{e.label}</span>
                      <span className="num text-right text-ink">
                        {formatEuros(e.amount)}
                      </span>
                      <div className="col-span-3 flex justify-end sm:col-span-1">
                        {!isClosed && (
                          <Form method="post" className="inline-block">
                            <input
                              type="hidden"
                              name="intent"
                              value="deleteExpense"
                            />
                            <input type="hidden" name="id" value={e.id} />
                            <Button
                              type="submit"
                              variant="destructive"
                              size="sm"
                            >
                              Supprimer
                            </Button>
                          </Form>
                        )}
                      </div>
                    </li>
                  ))}
```

with:

```tsx
                  {g.items.map((e) => (
                    <li
                      key={e.id}
                      className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-6 gap-y-1 py-3 sm:grid-cols-[10ch_1fr_auto_auto]"
                    >
                      <span className="eyebrow">{e.categoryName}</span>
                      <span className="text-ink">
                        {e.label}
                        {e.recurring === 1 && (
                          <span
                            className="ml-2 text-xs text-ink-soft"
                            title="Dépense récurrente — reportée dans le prévisionnel"
                            aria-label="récurrente"
                          >
                            ↻
                          </span>
                        )}
                      </span>
                      <span className="num text-right text-ink">
                        {formatEuros(e.amount)}
                      </span>
                      <div className="col-span-3 flex justify-end sm:col-span-1">
                        {!isClosed && (
                          <Form method="post" className="inline-block">
                            <input
                              type="hidden"
                              name="intent"
                              value="deleteExpense"
                            />
                            <input type="hidden" name="id" value={e.id} />
                            <Button
                              type="submit"
                              variant="destructive"
                              size="sm"
                            >
                              Supprimer
                            </Button>
                          </Form>
                        )}
                      </div>
                    </li>
                  ))}
```

### Step 3: Typecheck

- [ ] Run: `npm run typecheck`

Expected: no errors.

### Step 4: Commit

- [ ] Stage and commit:

```bash
git add app/routes/month-detail.tsx
git commit -m "feat(month-detail): recurring checkbox on expense form and marker on rows"
```

---

## Task 9: Draft rendering, preview block, remove duplicate button

**Files:**
- Modify: `app/routes/month-detail.tsx`

### Step 1: Remove the duplicateMonth action and button

- [ ] In the `action` function of `app/routes/month-detail.tsx`, delete the `duplicateMonth` branch (lines 121–125):

```ts
  if (intent === "duplicateMonth") {
    const next = nextMonth(year, month);
    const created = duplicateMonth(m.id, next.year, next.month);
    return redirect(`/months/${formatYyyyMm(created.year, created.month)}`);
  }
```

- [ ] Also remove the `m.status === "closed" && intent !== "duplicateMonth"` carve-out (lines 71–73) — replace it with:

```ts
  if (m.status === "closed") {
    return { error: "Mois clôturé, lecture seule." };
  }
```

- [ ] Remove the imports no longer used. Change the queries import block to drop `duplicateMonth` and `redirect`:

```ts
import {
  Form,
  Link,
  useActionData,
  useFetcher,
  useLoaderData,
} from "react-router";
```

```ts
import {
  addExpense,
  closeMonth,
  deleteExpense,
  ensureDraft,
  getForecastInput,
  getMonth,
  getMonthState,
  listActiveMembers,
  listCategories,
  listMonths,
  updateExpense,
  updateIncome,
} from "~/lib/queries.server";
```

- [ ] Drop `nextMonth` from the `month-utils` import only if it's no longer used elsewhere in the file. It is still used in the loader (§Task 7) — **keep** it. Final import line:

```ts
import { formatYyyyMm, monthLabel, nextMonth, parseYyyyMm } from "~/lib/month-utils";
```

- [ ] Delete the footer duplicateMonth buttons (lines 302–325). Replace the entire `<footer>` block with:

```tsx
        {/* --- Month actions --- */}
        <footer className="flex flex-wrap items-center justify-between gap-6 border-t border-rule pt-8 rise rise-4">
          <Link to="/months" className="text-sm text-ink-soft hover:text-ink underline-offset-4 hover:underline">
            ← Voir l’historique
          </Link>
          {state.month.status === "open" && <CloseMonthButton />}
        </footer>
```

This leaves the footer empty (apart from the history link) when the month is a draft or closed — both correct per spec §7.2 and existing closed-month behaviour.

### Step 2: Branch the header eyebrow on draft status

- [ ] Replace the `<header>` block (lines 152–161):

```tsx
        {/* --- Title --- */}
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 rise">
          <div>
            <p className="eyebrow">Mois en cours</p>
            <h1 className="mt-2 font-heading text-5xl leading-none tracking-tight text-ink">
              {monthLabel(state.month.year, state.month.month)}
            </h1>
          </div>
          <MonthStatusBadge status={state.month.status} />
        </header>
```

with:

```tsx
        {/* --- Title --- */}
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 rise">
          <div>
            <p className="eyebrow">
              {state.month.status === "draft"
                ? "Prévisionnel"
                : state.month.status === "closed"
                  ? "Mois clôturé"
                  : "Mois en cours"}
            </p>
            <h1 className="mt-2 font-heading text-5xl leading-none tracking-tight text-ink">
              {monthLabel(state.month.year, state.month.month)}
            </h1>
          </div>
          <MonthStatusBadge status={state.month.status} />
        </header>
```

### Step 3: Adjust `isClosed` usage

- [ ] The existing `const isClosed = state.month.status === "closed";` (line 134) is correct: drafts are fully editable. Leave unchanged.

### Step 4: Add the preview block under the results section

- [ ] Locate the end of the results `<section>` (line 300) — the closing `</section>` just after the individual totals block. Immediately **after** that closing `</section>` and **before** the `{/* --- Month actions --- */}` footer, insert:

```tsx
        {/* --- Prévisionnel --- */}
        {state.month.status === "open" && forecast && (
          <section className="rise rise-4" aria-labelledby="forecast-title">
            <div className="mb-5 flex items-baseline justify-between gap-4">
              <div>
                <p className="eyebrow">Prévisionnel</p>
                <h2
                  id="forecast-title"
                  className="mt-1 font-heading text-2xl text-ink"
                >
                  {monthLabel(forecast.year, forecast.month)}
                </h2>
              </div>
              <Link
                to={`/months/${formatYyyyMm(forecast.year, forecast.month)}`}
                className="text-sm text-ink-soft hover:text-ink underline-offset-4 hover:underline"
              >
                Éditer →
              </Link>
            </div>

            {forecast.recurringCount === 0 ? (
              <p className="max-w-[56ch] text-sm text-ink-soft">
                Marque tes dépenses régulières comme <em>récurrentes</em> pour
                voir apparaître le prévisionnel du mois suivant.
              </p>
            ) : (
              <div>
                <p className="eyebrow mb-2">À verser au compte commun (prévu)</p>
                <ul className="divide-y divide-rule border-t border-rule">
                  {forecast.result.proportional.map((s) => (
                    <li
                      key={s.memberId}
                      className="flex items-baseline justify-between gap-4 py-3"
                    >
                      <span className="text-ink">
                        {memberName(s.memberId)}
                      </span>
                      <span className="num font-heading text-xl text-accent">
                        {formatEuros(s.total)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-ink-soft">
                  Dépenses communes récurrentes: {forecast.recurringCount} · Total
                  commun prévu:{" "}
                  {formatEuros(
                    forecast.result.proportional.reduce(
                      (s, r) => s + r.total,
                      0
                    )
                  )}
                </p>
              </div>
            )}
          </section>
        )}
```

Note: `memberName` closure is defined at line 136 and reads from `state.incomes`. When the forecast is sourced from a materialised draft, the draft's own incomes may list members differently from the current month. For the preview block this is acceptable — the member IDs overlap (draft inherits from current), so `memberName` resolves correctly.

### Step 5: Typecheck

- [ ] Run: `npm run typecheck`

Expected: no errors.

### Step 6: Run full test suite

- [ ] Run: `npm test`

Expected: all suites pass.

### Step 7: Commit

- [ ] Stage and commit:

```bash
git add app/routes/month-detail.tsx
git commit -m "feat(month-detail): draft eyebrow, forecast preview block, remove duplicate button"
```

---

## Task 10: Manual end-to-end smoke

**Files:** none.

### Step 1: Reset and start the dev server

- [ ] Run: `task db:reset` (prompts for confirmation; accept).
- [ ] Seed a password if not already set: `task set-password -- <your-password>`.
- [ ] Start dev: `task dev` (background; opens on `http://localhost:5173`).

### Step 2: Verify the forecast is opt-in

- [ ] Log in. The home loader redirects to the current calendar month.
- [ ] Add at least one member (`Settings → Membres`) if the DB was fully reset.
- [ ] Add a revenu, then add a dépense "Loyer 1200 €" with all members checked and **"Récurrente" checked**.
- [ ] Add a second dépense "Plombier 150 €" **without** "Récurrente".
- [ ] Verify the ↻ glyph appears next to "Loyer" and not next to "Plombier" in the list.

### Step 3: Verify the preview block

- [ ] Scroll to the bottom of the month page. The "Prévisionnel — {mois+1}" section should show the loyer-only computation with a link "Éditer →".
- [ ] If you uncheck "Récurrente" (by deleting and recreating the dépense without the flag, since there is no edit UI), the preview falls back to the educational empty state.

### Step 4: Verify lazy draft materialisation

- [ ] Click "Éditer →". You land on `/months/{next-yyyy-mm}` which now shows the draft page: eyebrow "Prévisionnel", badge "Brouillon", the Loyer row is present (copied), revenus are copied, no "Clôturer le mois" button, no preview block for month+2.
- [ ] Add a dépense "Cadeau 60 €" (recurring unchecked). It belongs only to this draft.
- [ ] Navigate back to the previous month via `← Voir l'historique`. The "Plombier" and "Loyer" lines are unchanged.

### Step 5: Simulate rollover (best effort)

- [ ] Temporarily change the server's clock or skip this step. Alternatively, verify via the unit tests in `tests/rollover.test.ts` (run `task test`).
- [ ] If you can advance the clock: visit `/`. The previous month should flip to `closed`; the draft should flip to `open`; redirect lands on the new open month.

### Step 6: Stop dev server

- [ ] Stop `task dev`.

### Step 7: Commit (no changes expected)

- [ ] `git status` should report a clean tree. No commit.

---

## Self-Review Checklist

- **Spec §3.1 status enum** → Task 1 step 1 ✓
- **Spec §3.2 recurring column + migration** → Task 1 steps 1–3 ✓
- **Spec §4 applyRollover algorithm** → Task 4 step 3 ✓
- **Spec §5.1 ensureDraft** → Task 3 step 3 ✓
- **Spec §5.2 trigger points** → loader trigger Task 7 step 1; Link trigger covered by Task 9 step 4 (preview block) ✓
- **Spec §5.3 getForecastInput** → Task 3 step 4 ✓
- **Spec §6.1 preview block** → Task 9 step 4 ✓
- **Spec §6.2 recurring checkbox** → Task 8 step 1 ✓
- **Spec §6.3 recurring marker** → Task 8 step 2 ✓
- **Spec §7.1 loader extension** → Task 7 step 1 ✓
- **Spec §7.2 draft rendering** → Task 6, Task 9 steps 1–2 ✓
- **Spec §7.3 months list** → badge change in Task 6 covers this ✓
- **Spec §8 no calc changes** → verified, no task modifies `calc.ts` ✓
- **Spec §9 remove duplicate button** → Task 9 step 1 ✓
- **Spec §10.2/10.3 tests** → Task 2, Task 3, Task 4 ✓
- **Placeholders:** none.
- **Type consistency:** `MonthState.month.status` widened in Task 2 step 5; `MonthStatusBadge` prop widened in Task 6 step 1; loader returns `forecast` field consumed in the component (Task 7 step 2). `recurring` is `number` (0/1) consistently across schema, queries, UI.
- **Route smoke tests:** the existing `tests/smoke.test.ts` is a trivial sanity placeholder, not a route harness. Manual smoke in Task 10 substitutes.
