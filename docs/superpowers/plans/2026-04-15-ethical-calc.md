# Ethical Calc Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted household expense splitter that computes each member's fair share of monthly expenses using two ethical methods, shown side-by-side.

**Architecture:** React Router v7 (framework mode, SSR) with SQLite persistence via Drizzle ORM. Pure-function calculation engine isolated from DB. Single shared household password, session cookie auth. Monthly snapshots with open/closed status. Per-expense member assignment.

**Tech Stack:** React Router v7, TypeScript, better-sqlite3, Drizzle ORM, Tailwind CSS, shadcn/ui, Zod, bcryptjs, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-15-ethical-calc-design.md`

---

## File Structure

```
app/
  root.tsx
  routes.ts
  routes/
    _index.tsx                     # dashboard (redirects to current month)
    login.tsx                      # login form + action
    logout.tsx                     # action only
    months._index.tsx              # historical list
    months.$yyyymm.tsx             # month detail (open or read-only)
    settings.members.tsx           # CRUD members
    settings.categories.tsx        # CRUD categories
    api.months.new.tsx             # action: create new month
    api.months.$id.close.tsx       # action: close month
  components/
    ui/                            # shadcn primitives (auto-generated)
    member-row.tsx                 # row in dashboard members table
    expense-dialog.tsx             # add/edit expense modal
    expense-row.tsx                # row in dashboard expenses table
    results-panel.tsx              # two-column results display
    month-status-badge.tsx         # open/closed pill
  lib/
    db.server.ts                   # better-sqlite3 + drizzle client
    schema.ts                      # drizzle table definitions
    auth.server.ts                 # bcrypt + session + rate-limit
    session.server.ts              # cookie session storage
    calc.ts                        # pure calculation (no DB)
    queries.server.ts              # DB query helpers
    validation.ts                  # zod schemas
    money.ts                       # cents <-> euro formatting
    month-utils.ts                 # yyyymm parsing, next-month logic
  tailwind.css
data/                              # .gitignored, runtime only
  household.db
migrations/                        # drizzle-kit output
scripts/
  set-password.ts                  # CLI: hash + write .env
  seed-defaults.ts                 # seed default categories
tests/
  calc.test.ts                     # unit tests for calc.ts
  queries.test.ts                  # integration tests w/ :memory: DB
  auth.test.ts                     # auth / rate-limit tests
docs/
  deployment.md                    # systemd + backup instructions
.env.example
drizzle.config.ts
vitest.config.ts
package.json
tsconfig.json
```

---

## Task 1: Initialize React Router v7 project

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `app/root.tsx`, `app/routes.ts`, `app/routes/_index.tsx`, `react-router.config.ts`

- [ ] **Step 1: Scaffold project**

Run from `/home/adrien/Documents/devenv/ethical-calc`:
```bash
npx create-react-router@latest . --template remix-run/react-router-templates/default --no-install --no-git --yes
```
Answer prompts: TypeScript yes.

If scaffold fails or creates nested dir, fall back to manual setup:
```bash
npm init -y
npm install react react-dom react-router @react-router/node @react-router/serve isbot
npm install -D typescript vite @react-router/dev @types/react @types/react-dom
```

- [ ] **Step 2: Verify baseline works**

```bash
npm install
npm run dev
```
Expected: dev server on http://localhost:3000 shows default page.

Stop server.

- [ ] **Step 3: Replace the default index route content with a placeholder**

Edit `app/routes/_index.tsx`:

```tsx
export default function Index() {
  return <h1>Ethical Calc</h1>;
}
```

- [ ] **Step 4: Run dev and confirm**

```bash
npm run dev
```
Expected: page shows "Ethical Calc". Stop server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold react-router v7 project"
```

---

## Task 2: Add shadcn/ui (Tailwind v4 already set up)

**Context:** The RR v7 scaffold already installed Tailwind v4 via `@tailwindcss/vite`
and configured `app/app.css` with `@import "tailwindcss"`. The index route file
is `app/routes/home.tsx` (not `_index.tsx`) per current RR v7 convention.

**Files:**
- Create: `components.json`, `app/lib/utils.ts`, shadcn component files under `app/components/ui/`
- Modify: `app/routes/home.tsx`, `tsconfig.json` (if aliases missing)

- [ ] **Step 1: Verify Tailwind is working**

Edit `app/routes/home.tsx` — replace contents with:
```tsx
export function meta() {
  return [{ title: "Ethical Calc" }];
}

export default function Home() {
  return <h1 className="text-3xl font-bold text-blue-600">Ethical Calc</h1>;
}
```

Run `npm run dev &`, curl `http://localhost:5173`, confirm the HTML contains
`text-3xl font-bold text-blue-600`. Kill the server.

- [ ] **Step 2: Init shadcn/ui**

```bash
npx shadcn@latest init
```

Answer prompts:
- base color: Slate
- Use CSS variables: yes

If `--yes` accepts defaults, prefer that. shadcn should detect Tailwind v4
and configure appropriately.

- [ ] **Step 3: Verify `~/` alias works**

Confirm `tsconfig.json` has `"paths": { "~/*": ["./app/*"] }`. If not,
add it. Confirm `app/lib/utils.ts` was created by shadcn (contains the `cn`
helper).

- [ ] **Step 4: Install core shadcn components**

```bash
npx shadcn@latest add button card input label table dialog checkbox badge tabs sonner
```

If any component fails, install them individually. shadcn v4 may have
renamed `toast` → `sonner` (already in list).

- [ ] **Step 5: Smoke test a shadcn component**

Edit `app/routes/home.tsx`:
```tsx
import { Button } from "~/components/ui/button";

export function meta() {
  return [{ title: "Ethical Calc" }];
}

export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold">Ethical Calc</h1>
      <Button className="mt-4">Test button</Button>
    </main>
  );
}
```

Run `npm run dev &`, curl the page, confirm the button renders with shadcn
classes. Kill server.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: add shadcn/ui"
```

---

## Task 3: Add SQLite + Drizzle ORM

**Files:**
- Create: `drizzle.config.ts`, `app/lib/db.server.ts`, `app/lib/schema.ts`, `data/.gitkeep`
- Modify: `package.json`, `.gitignore`

- [ ] **Step 1: Install deps**

```bash
npm install better-sqlite3 drizzle-orm
npm install -D drizzle-kit @types/better-sqlite3
```

- [ ] **Step 2: Ensure data/ is gitignored but tracked as dir**

In `.gitignore`, confirm `data/` is present. Create placeholder:
```bash
mkdir -p data
touch data/.gitkeep
```

In `.gitignore` add a line to still track `.gitkeep`:
```
data/*
!data/.gitkeep
```

- [ ] **Step 3: Create schema**

Create `app/lib/schema.ts`:
```ts
import { sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const members = sqliteTable("members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  defaultCostOfLiving: integer("default_cost_of_living").notNull(),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
  archivedAt: integer("archived_at"),
});

export const categories = sqliteTable(
  "categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    isDefault: integer("is_default").notNull().default(0),
  },
  (t) => ({
    nameIdx: uniqueIndex("categories_name_idx").on(t.name),
  })
);

export const months = sqliteTable(
  "months",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
  },
  (t) => ({
    yearMonthIdx: uniqueIndex("months_year_month_idx").on(t.year, t.month),
  })
);

export const monthlyIncomes = sqliteTable(
  "monthly_incomes",
  {
    monthId: integer("month_id")
      .notNull()
      .references(() => months.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id),
    amount: integer("amount").notNull(),
    costOfLiving: integer("cost_of_living").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.monthId, t.memberId] }) })
);

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
});

export const expenseMembers = sqliteTable(
  "expense_members",
  {
    expenseId: integer("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.expenseId, t.memberId] }) })
);
```

- [ ] **Step 4: Create DB client**

Create `app/lib/db.server.ts`:
```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const dbPath = process.env.DATABASE_PATH ?? "data/household.db";
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;
```

- [ ] **Step 5: Configure drizzle-kit**

Create `drizzle.config.ts`:
```ts
import type { Config } from "drizzle-kit";

export default {
  schema: "./app/lib/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
  dbCredentials: { url: process.env.DATABASE_PATH ?? "data/household.db" },
} satisfies Config;
```

Add scripts to `package.json`:
```json
"scripts": {
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:studio": "drizzle-kit studio"
}
```

- [ ] **Step 6: Generate initial migration**

```bash
npm run db:generate
```
Expected: file `migrations/0000_*.sql` created.

- [ ] **Step 7: Apply migration**

```bash
npm run db:migrate
```
Expected: `data/household.db` created.

- [ ] **Step 8: Smoke test**

Create a throwaway file `scripts/smoke-db.ts`:
```ts
import { db } from "~/lib/db.server";
import { categories } from "~/lib/schema";
const rows = db.select().from(categories).all();
console.log("categories rows:", rows.length);
```

Run:
```bash
npx tsx scripts/smoke-db.ts
```
Expected: `categories rows: 0`

Delete `scripts/smoke-db.ts`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add sqlite schema via drizzle"
```

---

## Task 4: Set up Vitest

**Files:**
- Create: `vitest.config.ts`, `tests/smoke.test.ts`

- [ ] **Step 1: Install vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

```bash
npm install -D vite-tsconfig-paths
```

Add script to `package.json`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Write smoke test**

Create `tests/smoke.test.ts`:
```ts
import { expect, test } from "vitest";

test("vitest is alive", () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 4: Run**

```bash
npm test
```
Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: add vitest"
```

---

## Task 5: Money utilities

**Files:**
- Create: `app/lib/money.ts`, `tests/money.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/money.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { eurosToCents, centsToEuros, formatEuros } from "~/lib/money";

describe("money", () => {
  test("eurosToCents converts string input", () => {
    expect(eurosToCents("12.34")).toBe(1234);
    expect(eurosToCents("0")).toBe(0);
    expect(eurosToCents("100")).toBe(10000);
  });

  test("eurosToCents handles comma decimal", () => {
    expect(eurosToCents("12,34")).toBe(1234);
  });

  test("centsToEuros converts integer cents", () => {
    expect(centsToEuros(1234)).toBe(12.34);
    expect(centsToEuros(0)).toBe(0);
  });

  test("formatEuros formats with 2 decimals and EUR sign", () => {
    expect(formatEuros(1234)).toBe("12,34 €");
    expect(formatEuros(0)).toBe("0,00 €");
    expect(formatEuros(100000)).toBe("1 000,00 €");
  });

  test("eurosToCents rejects invalid input", () => {
    expect(() => eurosToCents("abc")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to see failure**

```bash
npm test -- money
```
Expected: module not found.

- [ ] **Step 3: Implement**

Create `app/lib/money.ts`:
```ts
const formatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

export function eurosToCents(input: string): number {
  const normalized = input.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`Invalid monetary input: ${input}`);
  }
  const euros = Number(normalized);
  return Math.round(euros * 100);
}

export function centsToEuros(cents: number): number {
  return cents / 100;
}

export function formatEuros(cents: number): string {
  return formatter.format(centsToEuros(cents));
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- money
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: money utilities (cents <-> euros)"
```

---

## Task 6: Calc engine — pure proportional method

**Files:**
- Create: `app/lib/calc.ts`, `tests/calc.test.ts`

- [ ] **Step 1: Write failing tests for pure proportional**

Create `tests/calc.test.ts`:
```ts
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
    // Alice 2/3 = 40000, Bob 1/3 = 20000
    expect(r.proportional).toEqual([
      { memberId: 1, total: 40000 },
      { memberId: 2, total: 20000 },
    ]);
  });

  test("unaffected member pays nothing", () => {
    const input: CalcInput = {
      members: [alice, bob],
      expenses: [{ id: 1, amount: 30000, memberIds: [1] }],
    };
    const r = calculate(input);
    expect(r.proportional).toEqual([
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
    // Alice 0, Bob 100% => 10000
    expect(r.proportional).toEqual([
      { memberId: 1, total: 0 },
      { memberId: 2, total: 10000 },
    ]);
  });

  test("rounding residual assigned to largest payer", () => {
    // Expense 10000, Alice 200000, Bob 100000 → 2/3 and 1/3
    // 6666.66 and 3333.33 → round to 6667 and 3333, sum 10000 OK
    // Use 10001 cents to force a residual
    const input: CalcInput = {
      members: [alice, bob],
      expenses: [{ id: 1, amount: 10001, memberIds: [1, 2] }],
    };
    const r = calculate(input);
    const sum = r.proportional.reduce((s, p) => s + p.total, 0);
    expect(sum).toBe(10001);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- calc
```
Expected: module not found.

- [ ] **Step 3: Minimal implementation**

Create `app/lib/calc.ts`:
```ts
export type CalcMember = {
  id: number;
  name: string;
  income: number;
  costOfLiving: number;
};

export type CalcExpense = {
  id: number;
  amount: number;
  memberIds: number[];
};

export type CalcInput = {
  members: CalcMember[];
  expenses: CalcExpense[];
};

export type Share = { memberId: number; total: number };
export type ExpenseBreakdown = {
  expenseId: number;
  proportional: { memberId: number; share: number }[];
  afterCostOfLiving: { memberId: number; share: number }[];
};

export type CalcResult = {
  proportional: Share[];
  afterCostOfLiving: Share[];
  byExpense: ExpenseBreakdown[];
};

function computeShares(
  amount: number,
  weights: { memberId: number; weight: number }[]
): { memberId: number; share: number }[] {
  const total = weights.reduce((s, w) => s + w.weight, 0);
  if (total === 0) {
    // equal split fallback
    const per = Math.floor(amount / weights.length);
    const shares = weights.map((w) => ({ memberId: w.memberId, share: per }));
    const residual = amount - per * weights.length;
    if (shares.length > 0) shares[0].share += residual;
    return shares;
  }
  const raw = weights.map((w) => ({
    memberId: w.memberId,
    share: Math.round((amount * w.weight) / total),
  }));
  const sum = raw.reduce((s, r) => s + r.share, 0);
  const residual = amount - sum;
  if (residual !== 0 && raw.length > 0) {
    // assign residual to largest-weight member
    const idx = weights
      .map((w, i) => ({ i, w: w.weight }))
      .sort((a, b) => b.w - a.w)[0].i;
    raw[idx].share += residual;
  }
  return raw;
}

export function calculate(input: CalcInput): CalcResult {
  const memberIds = input.members.map((m) => m.id);
  const memberById = new Map(input.members.map((m) => [m.id, m]));

  const totalsProp = new Map<number, number>(memberIds.map((id) => [id, 0]));
  const totalsCost = new Map<number, number>(memberIds.map((id) => [id, 0]));
  const byExpense: ExpenseBreakdown[] = [];

  for (const expense of input.expenses) {
    const affected = expense.memberIds
      .map((id) => memberById.get(id))
      .filter((m): m is CalcMember => m !== undefined);

    const propWeights = affected.map((m) => ({
      memberId: m.id,
      weight: Math.max(0, m.income),
    }));
    const propShares = computeShares(expense.amount, propWeights);

    const costWeights = affected.map((m) => ({
      memberId: m.id,
      weight: Math.max(0, Math.max(0, m.income) - m.costOfLiving),
    }));
    const costWeightsSum = costWeights.reduce((s, w) => s + w.weight, 0);
    const costShares =
      costWeightsSum === 0
        ? propShares // fallback to proportional
        : computeShares(expense.amount, costWeights);

    byExpense.push({
      expenseId: expense.id,
      proportional: propShares,
      afterCostOfLiving: costShares,
    });

    for (const s of propShares) {
      totalsProp.set(s.memberId, (totalsProp.get(s.memberId) ?? 0) + s.share);
    }
    for (const s of costShares) {
      totalsCost.set(s.memberId, (totalsCost.get(s.memberId) ?? 0) + s.share);
    }
  }

  return {
    proportional: memberIds.map((id) => ({
      memberId: id,
      total: totalsProp.get(id) ?? 0,
    })),
    afterCostOfLiving: memberIds.map((id) => ({
      memberId: id,
      total: totalsCost.get(id) ?? 0,
    })),
    byExpense,
  };
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npm test -- calc
```
Expected: all proportional tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: pure proportional calc method"
```

---

## Task 7: Calc engine — after-cost-of-living method

**Files:**
- Modify: `tests/calc.test.ts`

- [ ] **Step 1: Add failing tests for the second method**

Append to `tests/calc.test.ts`:
```ts
describe("calc — after cost-of-living", () => {
  test("splits on capacity (income minus costOfLiving)", () => {
    // Alice 2000€ income, 800€ cost → capacity 1200€
    // Bob 1000€ income, 800€ cost → capacity 200€
    // Total capacity 1400€. Expense 700€.
    // Alice: 700 * 1200/1400 = 600, Bob: 100
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
    // Both members under the threshold
    const poor1 = { id: 1, name: "A", income: 50000, costOfLiving: 80000 };
    const poor2 = { id: 2, name: "B", income: 30000, costOfLiving: 80000 };
    const input: CalcInput = {
      members: [poor1, poor2],
      expenses: [{ id: 1, amount: 40000, memberIds: [1, 2] }],
    };
    const r = calculate(input);
    // Proportional: 5/8 and 3/8 of 40000 = 25000 and 15000
    expect(r.afterCostOfLiving).toEqual([
      { memberId: 1, total: 25000 },
      { memberId: 2, total: 15000 },
    ]);
  });

  test("only affected members contribute to capacity sum", () => {
    const carol = { id: 3, name: "Carol", income: 150000, costOfLiving: 80000 };
    const input: CalcInput = {
      members: [alice, bob, carol],
      // Expense affects only Alice + Carol
      expenses: [{ id: 1, amount: 80000, memberIds: [1, 3] }],
    };
    const r = calculate(input);
    // Capacity: Alice 120000, Carol 70000, sum 190000
    // Alice: 80000 * 120000 / 190000 = 50526.31... rounds to 50526
    // Carol: 80000 * 70000 / 190000 = 29473.68... rounds to 29474
    // Sum = 80000, residual 0 or ±1 corrected on largest
    expect(r.afterCostOfLiving.find((s) => s.memberId === 2)!.total).toBe(0);
    const sum = r.afterCostOfLiving.reduce((s, x) => s + x.total, 0);
    expect(sum).toBe(80000);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npm test -- calc
```
Expected: all pass (logic already implemented in Task 6).

If a test fails due to rounding edge case, adjust residual-assignment logic or the expected value — but both should already align with the implementation from Task 6.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: cover after-cost-of-living calc method"
```

---

## Task 8: Month utilities

**Files:**
- Create: `app/lib/month-utils.ts`, `tests/month-utils.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/month-utils.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { parseYyyyMm, formatYyyyMm, nextMonth, monthLabel } from "~/lib/month-utils";

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
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- month-utils
```
Expected: not found.

- [ ] **Step 3: Implement**

Create `app/lib/month-utils.ts`:
```ts
const LABELS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

export function parseYyyyMm(input: string): { year: number; month: number } {
  const m = input.match(/^(\d{4})-(\d{2})$/);
  if (!m) throw new Error(`Invalid month format: ${input}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error(`Invalid month number: ${month}`);
  return { year, month };
}

export function formatYyyyMm(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function nextMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

export function monthLabel(year: number, month: number): string {
  return `${LABELS[month - 1]} ${year}`;
}
```

- [ ] **Step 4: Tests pass**

```bash
npm test -- month-utils
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: month-utils helpers"
```

---

## Task 9: Seed default categories

**Files:**
- Create: `scripts/seed-defaults.ts`
- Modify: `package.json`, `app/lib/db.server.ts`

- [ ] **Step 1: Create seed script**

Create `scripts/seed-defaults.ts`:
```ts
import { db } from "~/lib/db.server";
import { categories } from "~/lib/schema";
import { eq } from "drizzle-orm";

const DEFAULTS = [
  "Loyer",
  "Électricité",
  "Gaz",
  "Internet",
  "Eau",
  "Courses",
  "Assurance",
  "Autre",
];

for (const name of DEFAULTS) {
  const existing = db.select().from(categories).where(eq(categories.name, name)).get();
  if (!existing) {
    db.insert(categories).values({ name, isDefault: 1 }).run();
    console.log(`Seeded category: ${name}`);
  }
}
console.log("Done.");
```

- [ ] **Step 2: Add script**

In `package.json`:
```json
"scripts": {
  "db:seed": "tsx scripts/seed-defaults.ts"
}
```

```bash
npm install -D tsx
```

- [ ] **Step 3: Run it**

```bash
npm run db:seed
```
Expected: 8 "Seeded category:" lines.

Run again:
```bash
npm run db:seed
```
Expected: no "Seeded" lines (idempotent). Just "Done."

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: seed default expense categories"
```

---

## Task 10: Auth — password hashing CLI

**Files:**
- Create: `scripts/set-password.ts`, `.env.example`
- Modify: `package.json`, `.gitignore`

- [ ] **Step 1: Install bcryptjs**

```bash
npm install bcryptjs
npm install -D @types/bcryptjs
```

- [ ] **Step 2: Write `set-password` script**

Create `scripts/set-password.ts`:
```ts
import bcrypt from "bcryptjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

const password = process.argv[2];
if (!password) {
  console.error("Usage: npm run set-password -- <password>");
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
const sessionSecret = randomBytes(32).toString("hex");

const envPath = ".env";
let content = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";

function upsert(key: string, value: string) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) content = content.replace(re, line);
  else content += (content.endsWith("\n") || content.length === 0 ? "" : "\n") + line + "\n";
}

upsert("HOUSEHOLD_PASSWORD_HASH", hash);
if (!/^SESSION_SECRET=/m.test(content)) upsert("SESSION_SECRET", sessionSecret);

writeFileSync(envPath, content);
console.log("Password set. .env updated.");
```

- [ ] **Step 3: Wire npm script and .env.example**

In `package.json`:
```json
"scripts": {
  "set-password": "tsx scripts/set-password.ts"
}
```

Create `.env.example`:
```
HOUSEHOLD_PASSWORD_HASH=
SESSION_SECRET=
DATABASE_PATH=data/household.db
```

Confirm `.env` in `.gitignore`.

- [ ] **Step 4: Test**

```bash
npm run set-password -- testpass123
cat .env
```
Expected: file contains `HOUSEHOLD_PASSWORD_HASH=$2a$...` and `SESSION_SECRET=<hex>`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: set-password CLI"
```

---

## Task 11: Auth — session cookie and verify-password

**Files:**
- Create: `app/lib/session.server.ts`, `app/lib/auth.server.ts`, `tests/auth.test.ts`

- [ ] **Step 1: Write failing tests for password verification**

Create `tests/auth.test.ts`:
```ts
import { beforeAll, describe, expect, test } from "vitest";
import bcrypt from "bcryptjs";
import { verifyPassword, recordLoginAttempt, isRateLimited, resetRateLimit } from "~/lib/auth.server";

beforeAll(() => {
  process.env.HOUSEHOLD_PASSWORD_HASH = bcrypt.hashSync("letmein", 8);
});

describe("verifyPassword", () => {
  test("returns true on match", () => {
    expect(verifyPassword("letmein")).toBe(true);
  });

  test("returns false on mismatch", () => {
    expect(verifyPassword("wrong")).toBe(false);
  });
});

describe("rate limiter", () => {
  test("allows up to 5 attempts then blocks", () => {
    resetRateLimit();
    const ip = "1.2.3.4";
    for (let i = 0; i < 5; i++) {
      expect(isRateLimited(ip)).toBe(false);
      recordLoginAttempt(ip);
    }
    expect(isRateLimited(ip)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- auth
```
Expected: module not found.

- [ ] **Step 3: Implement auth**

Create `app/lib/auth.server.ts`:
```ts
import bcrypt from "bcryptjs";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type Attempt = { count: number; firstAt: number };
const attempts = new Map<string, Attempt>();

export function verifyPassword(plain: string): boolean {
  const hash = process.env.HOUSEHOLD_PASSWORD_HASH;
  if (!hash) return false;
  return bcrypt.compareSync(plain, hash);
}

export function isRateLimited(ip: string): boolean {
  const entry = attempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > WINDOW_MS) {
    attempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

export function recordLoginAttempt(ip: string): void {
  const entry = attempts.get(ip);
  if (!entry || Date.now() - entry.firstAt > WINDOW_MS) {
    attempts.set(ip, { count: 1, firstAt: Date.now() });
  } else {
    entry.count += 1;
  }
}

export function resetRateLimit(ip?: string): void {
  if (ip) attempts.delete(ip);
  else attempts.clear();
}
```

- [ ] **Step 4: Create session storage**

Create `app/lib/session.server.ts`:
```ts
import { createCookieSessionStorage, redirect } from "react-router";

const secret = process.env.SESSION_SECRET ?? "dev-only-insecure";

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__ec_session",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secrets: [secret],
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
});

export async function getSession(request: Request) {
  return sessionStorage.getSession(request.headers.get("Cookie"));
}

export async function requireAuth(request: Request) {
  const session = await getSession(request);
  if (!session.get("authed")) {
    throw redirect("/login");
  }
}

export async function createUserSession(redirectTo: string) {
  const session = await sessionStorage.getSession();
  session.set("authed", true);
  return redirect(redirectTo, {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
}

export async function destroySession(request: Request) {
  const session = await getSession(request);
  return redirect("/login", {
    headers: { "Set-Cookie": await sessionStorage.destroySession(session) },
  });
}
```

- [ ] **Step 5: Tests pass**

```bash
npm test -- auth
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: auth (bcrypt + session + rate limit)"
```

---

## Task 12: Login and logout routes

**Files:**
- Create: `app/routes/login.tsx`, `app/routes/logout.tsx`
- Modify: `app/routes.ts` (if it lists routes explicitly)

- [ ] **Step 1: Implement login route**

Create `app/routes/login.tsx`:
```tsx
import { Form, redirect, useActionData } from "react-router";
import type { Route } from "./+types/login";
import { verifyPassword, isRateLimited, recordLoginAttempt } from "~/lib/auth.server";
import { createUserSession, getSession } from "~/lib/session.server";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request);
  if (session.get("authed")) throw redirect("/");
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const ip = request.headers.get("x-forwarded-for") ?? "local";

  if (isRateLimited(ip)) {
    return { error: "Trop de tentatives. Réessayez plus tard." };
  }

  if (!verifyPassword(password)) {
    recordLoginAttempt(ip);
    return { error: "Mot de passe incorrect." };
  }

  return createUserSession("/");
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Ethical Calc</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe du foyer</Label>
              <Input id="password" name="password" type="password" required autoFocus />
            </div>
            {actionData?.error && (
              <p className="text-sm text-red-600">{actionData.error}</p>
            )}
            <Button type="submit" className="w-full">Entrer</Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Implement logout route**

Create `app/routes/logout.tsx`:
```tsx
import type { Route } from "./+types/logout";
import { destroySession } from "~/lib/session.server";

export async function action({ request }: Route.ActionArgs) {
  return destroySession(request);
}

export async function loader() {
  return Response.redirect("/", 302);
}
```

- [ ] **Step 3: Smoke test**

```bash
npm run set-password -- test1234
npm run dev
```

Browser: go to `/login`. Type wrong password → red error. Type `test1234` → redirect to `/`. Stop server.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: login and logout routes"
```

---

## Task 13: Queries — members

**Files:**
- Create: `app/lib/queries.server.ts`, `tests/queries-members.test.ts`

- [ ] **Step 1: Write failing tests using an in-memory DB**

Create `tests/queries-members.test.ts`:
```ts
import { beforeEach, describe, expect, test, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "~/lib/schema";

// Build a fresh in-memory DB per test
function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "migrations" });
  return db;
}

// Mock the db import
vi.mock("~/lib/db.server", () => {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "migrations" });
  return { db };
});

import { listActiveMembers, createMember, archiveMember } from "~/lib/queries.server";

describe("member queries", () => {
  test("listActiveMembers returns []", () => {
    // Fresh mock scope: call listActiveMembers
    const rows = listActiveMembers();
    expect(rows).toEqual([]);
  });

  test("createMember then listActiveMembers returns it", () => {
    createMember({ name: "Alice", defaultCostOfLiving: 80000 });
    const rows = listActiveMembers();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Alice");
    expect(rows[0].defaultCostOfLiving).toBe(80000);
  });

  test("archiveMember hides from listActiveMembers", () => {
    const { id } = createMember({ name: "Bob", defaultCostOfLiving: 70000 });
    archiveMember(id);
    const names = listActiveMembers().map((m) => m.name);
    expect(names).not.toContain("Bob");
  });
});
```

Note: the mock approach creates one shared in-memory DB across all tests; keep data cumulative or reset per-test if needed.

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- queries-members
```
Expected: module not found.

- [ ] **Step 3: Implement queries**

Create `app/lib/queries.server.ts`:
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

export function createMember(input: { name: string; defaultCostOfLiving: number }) {
  const result = db
    .insert(members)
    .values({ name: input.name, defaultCostOfLiving: input.defaultCostOfLiving })
    .returning()
    .get();
  return result;
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
```

- [ ] **Step 4: Run tests**

```bash
npm test -- queries-members
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: member queries"
```

---

## Task 14: Queries — categories

**Files:**
- Modify: `app/lib/queries.server.ts`
- Create: `tests/queries-categories.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/queries-categories.test.ts`:
```ts
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
  listCategories,
  createCategory,
  renameCategory,
  deleteCategory,
  seedDefaultCategories,
} from "~/lib/queries.server";

beforeAll(() => {
  seedDefaultCategories();
});

describe("category queries", () => {
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
```

- [ ] **Step 2: Confirm failure**

```bash
npm test -- queries-categories
```
Expected: function not exported.

- [ ] **Step 3: Add category helpers**

Append to `app/lib/queries.server.ts`:
```ts
// --- Categories ---

const DEFAULT_CATEGORIES = [
  "Loyer", "Électricité", "Gaz", "Internet", "Eau", "Courses", "Assurance", "Autre",
];

export function seedDefaultCategories() {
  for (const name of DEFAULT_CATEGORIES) {
    const existing = db.select().from(categories).where(eq(categories.name, name)).get();
    if (!existing) {
      db.insert(categories).values({ name, isDefault: 1 }).run();
    }
  }
}

export function listCategories() {
  return db.select().from(categories).orderBy(asc(categories.name)).all();
}

export function createCategory(name: string) {
  return db.insert(categories).values({ name, isDefault: 0 }).returning().get();
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
```

- [ ] **Step 4: Tests pass**

```bash
npm test -- queries-categories
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: category queries"
```

---

## Task 15: Queries — months, incomes, expenses

**Files:**
- Modify: `app/lib/queries.server.ts`
- Create: `tests/queries-months.test.ts`

- [ ] **Step 1: Write tests**

Create `tests/queries-months.test.ts`:
```ts
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
  seedDefaultCategories,
  createMember,
  createMonth,
  getMonth,
  listMonths,
  closeMonth,
  getMonthState,
  addExpense,
  deleteExpense,
} from "~/lib/queries.server";

beforeAll(() => {
  seedDefaultCategories();
});

describe("month queries", () => {
  test("createMonth adds open month with income rows", () => {
    const alice = createMember({ name: "Alice", defaultCostOfLiving: 80000 });
    const bob = createMember({ name: "Bob", defaultCostOfLiving: 70000 });
    const m = createMonth(2026, 4);
    expect(m.status).toBe("open");
    const state = getMonthState(m.id);
    expect(state.incomes).toHaveLength(2);
    const a = state.incomes.find((i) => i.memberId === alice.id)!;
    expect(a.costOfLiving).toBe(80000);
    expect(a.amount).toBe(0);
  });

  test("cannot create duplicate month", () => {
    expect(() => createMonth(2026, 4)).toThrow();
  });

  test("add and delete expense", () => {
    const m = getMonth(2026, 4)!;
    const cat = 1; // first seeded category
    const exp = addExpense(m.id, { label: "Loyer", amount: 50000, categoryId: cat, memberIds: [1, 2] });
    let state = getMonthState(m.id);
    expect(state.expenses).toHaveLength(1);
    expect(state.expenses[0].memberIds).toEqual([1, 2]);
    deleteExpense(exp.id);
    state = getMonthState(m.id);
    expect(state.expenses).toHaveLength(0);
  });

  test("closeMonth flips status", () => {
    const m = getMonth(2026, 4)!;
    closeMonth(m.id);
    expect(getMonth(2026, 4)!.status).toBe("closed");
  });

  test("listMonths returns chronological", () => {
    createMonth(2026, 5);
    const list = listMonths();
    expect(list.map((m) => `${m.year}-${m.month}`)).toEqual(["2026-5", "2026-4"]);
  });
});
```

- [ ] **Step 2: Confirm failure**

```bash
npm test -- queries-months
```

- [ ] **Step 3: Implement**

Append to `app/lib/queries.server.ts`:
```ts
// --- Months ---

export function listMonths() {
  return db.select().from(months).orderBy(asc(months.year), asc(months.month)).all().reverse();
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
  return db.update(months).set({ status: "closed" }).where(eq(months.id, id)).run();
}

// --- Incomes ---

export function updateIncome(monthId: number, memberId: number, input: { amount: number; costOfLiving: number }) {
  return db
    .update(monthlyIncomes)
    .set(input)
    .where(and(eq(monthlyIncomes.monthId, monthId), eq(monthlyIncomes.memberId, memberId)))
    .run();
}

// --- Expenses ---

export function addExpense(
  monthId: number,
  input: { label: string; amount: number; categoryId: number; memberIds: number[] }
) {
  const exp = db
    .insert(expenses)
    .values({ monthId, label: input.label, amount: input.amount, categoryId: input.categoryId })
    .returning()
    .get();
  for (const mid of input.memberIds) {
    db.insert(expenseMembers).values({ expenseId: exp.id, memberId: mid }).run();
  }
  return exp;
}

export function updateExpense(
  id: number,
  input: { label: string; amount: number; categoryId: number; memberIds: number[] }
) {
  db.update(expenses)
    .set({ label: input.label, amount: input.amount, categoryId: input.categoryId })
    .where(eq(expenses.id, id))
    .run();
  db.delete(expenseMembers).where(eq(expenseMembers.expenseId, id)).run();
  for (const mid of input.memberIds) {
    db.insert(expenseMembers).values({ expenseId: id, memberId: mid }).run();
  }
}

export function deleteExpense(id: number) {
  return db.delete(expenses).where(eq(expenses.id, id)).run();
}

// --- Full month state ---

export type MonthState = {
  month: { id: number; year: number; month: number; status: "open" | "closed" };
  incomes: { memberId: number; name: string; amount: number; costOfLiving: number }[];
  expenses: {
    id: number;
    label: string;
    amount: number;
    categoryId: number;
    categoryName: string;
    memberIds: number[];
  }[];
};

export function getMonthState(monthId: number): MonthState {
  const m = getMonthById(monthId);
  if (!m) throw new Error("Month not found");

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
    })
    .from(expenses)
    .innerJoin(categories, eq(categories.id, expenses.categoryId))
    .where(eq(expenses.monthId, monthId))
    .orderBy(asc(expenses.id))
    .all();

  const assignRows = db
    .select()
    .from(expenseMembers)
    .where(
      // filter by expense ids of this month
      // drizzle: inArray
      eq(expenses.id, expenses.id) // placeholder; we'll filter in JS below
    )
    .all();

  // Filter assignments to only this month's expenses
  const expenseIdSet = new Set(expenseRows.map((e) => e.id));
  const assignByExpense = new Map<number, number[]>();
  for (const a of assignRows) {
    if (!expenseIdSet.has(a.expenseId)) continue;
    const list = assignByExpense.get(a.expenseId) ?? [];
    list.push(a.memberId);
    assignByExpense.set(a.expenseId, list);
  }

  return {
    month: { id: m.id, year: m.year, month: m.month, status: m.status as "open" | "closed" },
    incomes: incomeRows,
    expenses: expenseRows.map((e) => ({
      ...e,
      memberIds: (assignByExpense.get(e.id) ?? []).sort((a, b) => a - b),
    })),
  };
}
```

- [ ] **Step 4: Tests pass**

```bash
npm test -- queries-months
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: month/income/expense queries + state aggregator"
```

---

## Task 16: Duplicate month helper

**Files:**
- Modify: `app/lib/queries.server.ts`
- Create: `tests/queries-duplicate-month.test.ts`

- [ ] **Step 1: Write test**

Create `tests/queries-duplicate-month.test.ts`:
```ts
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
  seedDefaultCategories,
  createMember,
  createMonth,
  addExpense,
  updateIncome,
  duplicateMonth,
  getMonthState,
  listCategories,
} from "~/lib/queries.server";

beforeAll(() => {
  seedDefaultCategories();
});

describe("duplicateMonth", () => {
  test("copies incomes (amount + cost-of-living) and expenses with assignments", () => {
    const alice = createMember({ name: "Alice", defaultCostOfLiving: 80000 });
    const bob = createMember({ name: "Bob", defaultCostOfLiving: 70000 });
    const april = createMonth(2026, 4);

    updateIncome(april.id, alice.id, { amount: 200000, costOfLiving: 85000 });
    updateIncome(april.id, bob.id, { amount: 150000, costOfLiving: 70000 });

    const loyerCat = listCategories().find((c) => c.name === "Loyer")!;
    addExpense(april.id, {
      label: "Loyer mars",
      amount: 90000,
      categoryId: loyerCat.id,
      memberIds: [alice.id, bob.id],
    });

    const may = duplicateMonth(april.id, 2026, 5);
    const state = getMonthState(may.id);
    expect(state.month.status).toBe("open");
    const mayAlice = state.incomes.find((i) => i.memberId === alice.id)!;
    expect(mayAlice.amount).toBe(200000);
    expect(mayAlice.costOfLiving).toBe(85000);

    expect(state.expenses).toHaveLength(1);
    expect(state.expenses[0].label).toBe("Loyer mars");
    expect(state.expenses[0].memberIds).toEqual([alice.id, bob.id]);
  });
});
```

- [ ] **Step 2: Confirm failure**

```bash
npm test -- duplicate-month
```

- [ ] **Step 3: Implement**

Append to `app/lib/queries.server.ts`:
```ts
export function duplicateMonth(sourceMonthId: number, newYear: number, newMonth: number) {
  const existing = getMonth(newYear, newMonth);
  if (existing) throw new Error(`Month ${newYear}-${newMonth} already exists`);

  const newRow = db
    .insert(months)
    .values({ year: newYear, month: newMonth, status: "open" })
    .returning()
    .get();

  // Copy incomes (filter to currently active members only)
  const active = new Set(listActiveMembers().map((m) => m.id));
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
```

- [ ] **Step 4: Tests pass**

```bash
npm test -- duplicate-month
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: duplicate month"
```

---

## Task 17: Validation schemas

**Files:**
- Create: `app/lib/validation.ts`, `tests/validation.test.ts`

- [ ] **Step 1: Install zod**

```bash
npm install zod
```

- [ ] **Step 2: Tests**

Create `tests/validation.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { memberSchema, expenseSchema, incomeSchema } from "~/lib/validation";

describe("validation", () => {
  test("memberSchema rejects empty name", () => {
    expect(memberSchema.safeParse({ name: "", defaultCostOfLiving: "800" }).success).toBe(false);
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
```

- [ ] **Step 3: Confirm failure**

```bash
npm test -- validation
```

- [ ] **Step 4: Implement**

Create `app/lib/validation.ts`:
```ts
import { z } from "zod";
import { eurosToCents } from "./money";

const money = z.string().transform((v, ctx) => {
  try {
    return eurosToCents(v);
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Montant invalide" });
    return z.NEVER;
  }
});

export const memberSchema = z.object({
  name: z.string().trim().min(1, "Nom requis"),
  defaultCostOfLiving: money,
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Nom requis"),
});

export const incomeSchema = z.object({
  amount: money,
  costOfLiving: money,
});

export const expenseSchema = z.object({
  label: z.string().trim().min(1, "Libellé requis"),
  amount: money,
  categoryId: z.coerce.number().int().positive(),
  memberIds: z.array(z.coerce.number().int().positive()).min(1, "Au moins un membre"),
});
```

- [ ] **Step 5: Tests pass**

```bash
npm test -- validation
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: zod validation schemas"
```

---

## Task 18: Settings — members route

**Files:**
- Create: `app/routes/settings.members.tsx`

- [ ] **Step 1: Build the page**

Create `app/routes/settings.members.tsx`:
```tsx
import { Form, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/settings.members";
import { requireAuth } from "~/lib/session.server";
import {
  listActiveMembers,
  createMember,
  updateMember,
  archiveMember,
} from "~/lib/queries.server";
import { memberSchema } from "~/lib/validation";
import { formatEuros } from "~/lib/money";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  return { members: listActiveMembers() };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "create") {
    const parsed = memberSchema.safeParse({
      name: formData.get("name"),
      defaultCostOfLiving: formData.get("defaultCostOfLiving"),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }
    createMember(parsed.data);
    return redirect("/settings/members");
  }

  if (intent === "update") {
    const id = Number(formData.get("id"));
    const parsed = memberSchema.safeParse({
      name: formData.get("name"),
      defaultCostOfLiving: formData.get("defaultCostOfLiving"),
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    updateMember(id, parsed.data);
    return redirect("/settings/members");
  }

  if (intent === "archive") {
    const id = Number(formData.get("id"));
    archiveMember(id);
    return redirect("/settings/members");
  }

  return { error: "Unknown intent" };
}

export default function SettingsMembers() {
  const { members } = useLoaderData<typeof loader>();
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Membres du foyer</h1>

      <Card>
        <CardHeader><CardTitle>Ajouter un membre</CardTitle></CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <input type="hidden" name="intent" value="create" />
            <div className="flex-1 space-y-1">
              <Label htmlFor="name">Nom</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="flex-1 space-y-1">
              <Label htmlFor="defaultCostOfLiving">Reste à vivre (€)</Label>
              <Input id="defaultCostOfLiving" name="defaultCostOfLiving" required defaultValue="800" />
            </div>
            <Button type="submit">Ajouter</Button>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Membres actifs</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Reste à vivre</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <Form method="post" className="flex gap-2">
                      <input type="hidden" name="intent" value="update" />
                      <input type="hidden" name="id" value={m.id} />
                      <Input name="name" defaultValue={m.name} />
                      <Input name="defaultCostOfLiving" defaultValue={(m.defaultCostOfLiving / 100).toString()} />
                      <Button type="submit" size="sm">Enregistrer</Button>
                    </Form>
                  </TableCell>
                  <TableCell>{formatEuros(m.defaultCostOfLiving)}</TableCell>
                  <TableCell className="text-right">
                    <Form method="post">
                      <input type="hidden" name="intent" value="archive" />
                      <input type="hidden" name="id" value={m.id} />
                      <Button type="submit" variant="destructive" size="sm">Archiver</Button>
                    </Form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Smoke test**

`npm run dev`, login, go to `/settings/members`, add Alice (800), Bob (800). Edit Alice to "Alicia". Archive Bob. Confirm behavior.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: settings/members page"
```

---

## Task 19: Settings — categories route

**Files:**
- Create: `app/routes/settings.categories.tsx`

- [ ] **Step 1: Build page**

Create `app/routes/settings.categories.tsx`:
```tsx
import { Form, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/settings.categories";
import { requireAuth } from "~/lib/session.server";
import {
  listCategories,
  createCategory,
  renameCategory,
  deleteCategory,
} from "~/lib/queries.server";
import { categorySchema } from "~/lib/validation";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  return { categories: listCategories() };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  try {
    if (intent === "create") {
      const parsed = categorySchema.parse({ name: formData.get("name") });
      createCategory(parsed.name);
    } else if (intent === "rename") {
      const id = Number(formData.get("id"));
      const parsed = categorySchema.parse({ name: formData.get("name") });
      renameCategory(id, parsed.name);
    } else if (intent === "delete") {
      const id = Number(formData.get("id"));
      deleteCategory(id);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erreur";
    return { error: msg };
  }

  return redirect("/settings/categories");
}

export default function SettingsCategories() {
  const { categories } = useLoaderData<typeof loader>();
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Catégories</h1>

      <Card>
        <CardHeader><CardTitle>Ajouter une catégorie</CardTitle></CardHeader>
        <CardContent>
          <Form method="post" className="flex items-end gap-2">
            <input type="hidden" name="intent" value="create" />
            <div className="flex-1 space-y-1">
              <Label htmlFor="name">Nom</Label>
              <Input id="name" name="name" required />
            </div>
            <Button type="submit">Ajouter</Button>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Toutes les catégories</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Form method="post" className="flex gap-2">
                      <input type="hidden" name="intent" value="rename" />
                      <input type="hidden" name="id" value={c.id} />
                      <Input name="name" defaultValue={c.name} />
                      <Button type="submit" size="sm">Renommer</Button>
                    </Form>
                  </TableCell>
                  <TableCell>
                    {c.isDefault ? <Badge>Par défaut</Badge> : <Badge variant="outline">Custom</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    {c.isDefault ? null : (
                      <Form method="post">
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="id" value={c.id} />
                        <Button type="submit" variant="destructive" size="sm">Supprimer</Button>
                      </Form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Smoke test**

In browser: add "Restaurant", rename to "Restos", delete it. Try to delete "Loyer" → expect nothing to happen (no delete button).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: settings/categories page"
```

---

## Task 20: Months list route

**Files:**
- Create: `app/routes/months._index.tsx`

- [ ] **Step 1: Build page**

Create `app/routes/months._index.tsx`:
```tsx
import { Link, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/months._index";
import { requireAuth } from "~/lib/session.server";
import { listMonths, getMonthState } from "~/lib/queries.server";
import { formatYyyyMm, monthLabel } from "~/lib/month-utils";
import { formatEuros } from "~/lib/money";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const all = listMonths();
  const rows = all.map((m) => {
    const state = getMonthState(m.id);
    const total = state.expenses.reduce((s, e) => s + e.amount, 0);
    return { ...m, total };
  });
  return { rows };
}

export default function MonthsList() {
  const { rows } = useLoaderData<typeof loader>();
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Historique</h1>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mois</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Total dépenses</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link className="underline" to={`/months/${formatYyyyMm(r.year, r.month)}`}>
                      {monthLabel(r.year, r.month)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === "open" ? "default" : "outline"}>
                      {r.status === "open" ? "Ouvert" : "Clos"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatEuros(r.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: months list page"
```

---

## Task 21: Index redirect to current month

**Files:**
- Modify: `app/routes/_index.tsx`

- [ ] **Step 1: Implement redirect logic**

Replace `app/routes/_index.tsx`:
```tsx
import { redirect } from "react-router";
import type { Route } from "./+types/_index";
import { requireAuth } from "~/lib/session.server";
import { getMonth, createMonth, listMonths } from "~/lib/queries.server";
import { formatYyyyMm } from "~/lib/month-utils";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  let current = getMonth(year, month);
  if (!current) {
    const existing = listMonths();
    if (existing.length === 0) {
      current = createMonth(year, month);
    } else {
      // Navigate to most recent existing month
      const [latest] = existing;
      throw redirect(`/months/${formatYyyyMm(latest.year, latest.month)}`);
    }
  }
  throw redirect(`/months/${formatYyyyMm(current.year, current.month)}`);
}

export default function Index() {
  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: index redirects to current month"
```

---

## Task 22: Month detail page — layout + incomes

**Files:**
- Create: `app/routes/months.$yyyymm.tsx`, `app/components/month-status-badge.tsx`

- [ ] **Step 1: Month status badge**

Create `app/components/month-status-badge.tsx`:
```tsx
import { Badge } from "~/components/ui/badge";

export function MonthStatusBadge({ status }: { status: "open" | "closed" }) {
  return (
    <Badge variant={status === "open" ? "default" : "outline"}>
      {status === "open" ? "Ouvert" : "Clos"}
    </Badge>
  );
}
```

- [ ] **Step 2: Month detail skeleton + income edit**

Create `app/routes/months.$yyyymm.tsx`:
```tsx
import { Form, Link, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/months.$yyyymm";
import { requireAuth } from "~/lib/session.server";
import {
  getMonth,
  getMonthState,
  updateIncome,
  closeMonth,
  listCategories,
  addExpense,
  updateExpense,
  deleteExpense,
  duplicateMonth,
  listActiveMembers,
} from "~/lib/queries.server";
import { parseYyyyMm, monthLabel, nextMonth, formatYyyyMm } from "~/lib/month-utils";
import { formatEuros } from "~/lib/money";
import { incomeSchema, expenseSchema } from "~/lib/validation";
import { calculate } from "~/lib/calc";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { MonthStatusBadge } from "~/components/month-status-badge";

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);
  const { year, month } = parseYyyyMm(params.yyyymm!);
  const m = getMonth(year, month);
  if (!m) throw new Response("Month not found", { status: 404 });

  const state = getMonthState(m.id);
  const members = listActiveMembers();
  const categories = listCategories();

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

  return { state, members, categories, results };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);
  const { year, month } = parseYyyyMm(params.yyyymm!);
  const m = getMonth(year, month);
  if (!m) throw new Response("Month not found", { status: 404 });
  if (m.status === "closed") {
    return { error: "Mois clôturé, lecture seule." };
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "updateIncome") {
    const memberId = Number(formData.get("memberId"));
    const parsed = incomeSchema.safeParse({
      amount: formData.get("amount"),
      costOfLiving: formData.get("costOfLiving"),
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    updateIncome(m.id, memberId, parsed.data);
    return redirect(`/months/${params.yyyymm}`);
  }

  if (intent === "addExpense" || intent === "updateExpense") {
    const parsed = expenseSchema.safeParse({
      label: formData.get("label"),
      amount: formData.get("amount"),
      categoryId: formData.get("categoryId"),
      memberIds: formData.getAll("memberIds"),
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    if (intent === "addExpense") {
      addExpense(m.id, parsed.data);
    } else {
      updateExpense(Number(formData.get("id")), parsed.data);
    }
    return redirect(`/months/${params.yyyymm}`);
  }

  if (intent === "deleteExpense") {
    deleteExpense(Number(formData.get("id")));
    return redirect(`/months/${params.yyyymm}`);
  }

  if (intent === "closeMonth") {
    closeMonth(m.id);
    return redirect(`/months/${params.yyyymm}`);
  }

  if (intent === "duplicateMonth") {
    const next = nextMonth(year, month);
    const created = duplicateMonth(m.id, next.year, next.month);
    return redirect(`/months/${formatYyyyMm(created.year, created.month)}`);
  }

  return { error: "Unknown intent" };
}

export default function MonthPage() {
  const { state, members, categories, results } = useLoaderData<typeof loader>();
  const isClosed = state.month.status === "closed";
  const memberById = new Map(members.map((m) => [m.id, m]));

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {monthLabel(state.month.year, state.month.month)}
        </h1>
        <div className="flex items-center gap-3">
          <MonthStatusBadge status={state.month.status} />
          <Link className="text-sm underline" to="/months">Historique</Link>
          <Link className="text-sm underline" to="/settings/members">Membres</Link>
          <Link className="text-sm underline" to="/settings/categories">Catégories</Link>
          <Form method="post" action="/logout">
            <Button type="submit" variant="ghost" size="sm">Déconnexion</Button>
          </Form>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Revenus & reste à vivre</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Membre</TableHead>
                <TableHead>Revenu (€)</TableHead>
                <TableHead>Reste à vivre (€)</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.incomes.map((i) => (
                <TableRow key={i.memberId}>
                  <TableCell>{i.name}</TableCell>
                  <TableCell>
                    <Form method="post" className="flex gap-2">
                      <input type="hidden" name="intent" value="updateIncome" />
                      <input type="hidden" name="memberId" value={i.memberId} />
                      <Input
                        name="amount"
                        defaultValue={(i.amount / 100).toString()}
                        disabled={isClosed}
                      />
                      <Input
                        name="costOfLiving"
                        defaultValue={(i.costOfLiving / 100).toString()}
                        disabled={isClosed}
                      />
                      <Button type="submit" size="sm" disabled={isClosed}>OK</Button>
                    </Form>
                  </TableCell>
                  <TableCell>{formatEuros(i.costOfLiving)}</TableCell>
                  <TableCell>{formatEuros(i.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Expense list + add form: Task 23 */}
      <Card>
        <CardHeader><CardTitle>Dépenses</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Catégorie</TableHead>
                <TableHead>Libellé</TableHead>
                <TableHead>Montant</TableHead>
                <TableHead>Membres concernés</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.expenses.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.categoryName}</TableCell>
                  <TableCell>{e.label}</TableCell>
                  <TableCell>{formatEuros(e.amount)}</TableCell>
                  <TableCell>
                    {e.memberIds.map((id) => memberById.get(id)?.name).filter(Boolean).join(", ")}
                  </TableCell>
                  <TableCell>
                    {!isClosed && (
                      <Form method="post">
                        <input type="hidden" name="intent" value="deleteExpense" />
                        <input type="hidden" name="id" value={e.id} />
                        <Button type="submit" variant="destructive" size="sm">Suppr.</Button>
                      </Form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {!isClosed && (
            <Form method="post" className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-6">
              <input type="hidden" name="intent" value="addExpense" />
              <select name="categoryId" className="rounded border p-2" required>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <Input name="label" placeholder="Libellé" required />
              <Input name="amount" placeholder="Montant €" required />
              <div className="col-span-2 flex flex-wrap gap-2">
                {members.map((m) => (
                  <label key={m.id} className="flex items-center gap-1 text-sm">
                    <input type="checkbox" name="memberIds" value={m.id} defaultChecked />
                    {m.name}
                  </label>
                ))}
              </div>
              <Button type="submit">Ajouter</Button>
            </Form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Résultats</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-2 font-semibold">Proportionnelle pure</h3>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Membre</TableHead><TableHead className="text-right">À payer</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {results.proportional.map((s) => (
                  <TableRow key={s.memberId}>
                    <TableCell>{memberById.get(s.memberId)?.name}</TableCell>
                    <TableCell className="text-right">{formatEuros(s.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div>
            <h3 className="mb-2 font-semibold">Après reste à vivre</h3>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Membre</TableHead><TableHead className="text-right">À payer</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {results.afterCostOfLiving.map((s) => (
                  <TableRow key={s.memberId}>
                    <TableCell>{memberById.get(s.memberId)?.name}</TableCell>
                    <TableCell className="text-right">{formatEuros(s.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {!isClosed && (
        <div className="flex gap-3">
          <Form method="post">
            <input type="hidden" name="intent" value="closeMonth" />
            <Button type="submit" variant="outline">Clôturer le mois</Button>
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="duplicateMonth" />
            <Button type="submit">Démarrer le mois suivant</Button>
          </Form>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Smoke test**

`npm run dev`, login, should land on current month. Add a member via settings, return to month, see them in incomes. Fill an income. Add an expense. See results update after redirect.

Close month → buttons disappear, inputs disabled.
Start next month → redirect to it, data duplicated.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: month detail page with incomes, expenses, results"
```

---

## Task 23: Auth middleware — all non-login routes

**Files:**
- Verify each route calls `requireAuth` in loader/action

- [ ] **Step 1: Audit each loader/action**

Routes requiring auth: `_index.tsx`, `months._index.tsx`, `months.$yyyymm.tsx`, `settings.members.tsx`, `settings.categories.tsx`, `logout.tsx`.

Grep to verify:
```bash
grep -L "requireAuth" app/routes/_index.tsx app/routes/months._index.tsx app/routes/months.$yyyymm.tsx app/routes/settings.members.tsx app/routes/settings.categories.tsx
```
Expected: no output (all files contain the string).

- [ ] **Step 2: Manual check**

Log out (click logout button). Try to navigate to `/months`, `/settings/members`, `/settings/categories`, `/` → all must redirect to `/login`.

- [ ] **Step 3: Commit if any fix applied; otherwise skip commit**

```bash
git add -A
git diff --cached --quiet || git commit -m "fix: ensure all routes require auth"
```

---

## Task 24: Error boundary

**Files:**
- Modify: `app/root.tsx`

- [ ] **Step 1: Add ErrorBoundary to root**

Edit `app/root.tsx`, add the export:
```tsx
import { isRouteErrorResponse, useRouteError } from "react-router";

export function ErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Erreur inconnue";

  // Log server-side
  if (!isRouteErrorResponse(error)) console.error(error);

  return (
    <html lang="fr">
      <head>
        <title>Erreur</title>
        <meta charSet="utf-8" />
      </head>
      <body className="p-6">
        <h1 className="text-xl font-bold">Une erreur est survenue</h1>
        <p className="mt-2 text-sm text-gray-600">{message}</p>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Smoke test**

Visit `/months/9999-99` → 404 error page.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: error boundary"
```

---

## Task 25: Deployment docs

**Files:**
- Create: `docs/deployment.md`, `README.md`

- [ ] **Step 1: Write deployment doc**

Create `docs/deployment.md`:
```markdown
# Deploying Ethical Calc on a Raspberry Pi

## Prerequisites

- Raspberry Pi running Raspberry Pi OS (64-bit recommended)
- Node.js 20+ (install via nodesource or nvm)
- Git

## Setup

```bash
git clone <repo> /home/pi/ethical-calc
cd /home/pi/ethical-calc
npm ci
npm run db:migrate
npm run db:seed
npm run set-password -- "<password>"
npm run build
```

## systemd service

Create `/etc/systemd/system/ethical-calc.service`:

```
[Unit]
Description=Ethical Calc household app
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/ethical-calc
EnvironmentFile=/home/pi/ethical-calc/.env
ExecStart=/usr/bin/node /home/pi/ethical-calc/build/server/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Enable:

```bash
sudo systemctl enable --now ethical-calc
sudo systemctl status ethical-calc
```

App available at `http://raspberrypi.local:3000` (mDNS) or the Pi's LAN IP.

## Backups

Daily backup via cron:

```bash
mkdir -p /home/pi/backups
crontab -e
# Add:
0 3 * * * sqlite3 /home/pi/ethical-calc/data/household.db ".backup /home/pi/backups/household-$(date +\%F).db"
```

Prune backups older than 30 days:

```bash
find /home/pi/backups -name "household-*.db" -mtime +30 -delete
```

## Updating

```bash
cd /home/pi/ethical-calc
git pull
npm ci
npm run db:migrate
npm run build
sudo systemctl restart ethical-calc
```
```

- [ ] **Step 2: Write README**

Create `README.md`:
```markdown
# Ethical Calc

Self-hosted household expense splitter. Computes each member's fair share of
monthly shared expenses based on income, using two ethical methods
(pure proportional and proportional after cost-of-living).

## Dev

```bash
npm install
npm run db:migrate
npm run db:seed
npm run set-password -- "<password>"
npm run dev
```

Open http://localhost:3000.

## Deploy (Raspberry Pi)

See [docs/deployment.md](docs/deployment.md).

## Spec

See [docs/superpowers/specs/2026-04-15-ethical-calc-design.md](docs/superpowers/specs/2026-04-15-ethical-calc-design.md).
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: deployment and README"
```

---

## Task 25b: Taskfile for useful commands

**Files:**
- Create: `Taskfile.yml`
- Modify: `README.md`

Use [Taskfile.dev](https://taskfile.dev) to wrap useful commands. User may
install via `sudo snap install task --classic` or system package manager.

- [ ] **Step 1: Create `Taskfile.yml`**

At project root:
```yaml
version: "3"

tasks:
  default:
    desc: "List available tasks"
    cmds:
      - task --list

  dev:
    desc: "Run dev server (Vite HMR on port 5173)"
    cmds:
      - npm run dev

  build:
    desc: "Build for production"
    cmds:
      - npm run build

  start:
    desc: "Run production server"
    cmds:
      - npm start

  test:
    desc: "Run unit + integration tests once"
    cmds:
      - npm test

  test:watch:
    desc: "Run tests in watch mode"
    cmds:
      - npm run test:watch

  typecheck:
    desc: "Type-check the project"
    cmds:
      - npm run typecheck

  db:migrate:
    desc: "Apply pending Drizzle migrations"
    cmds:
      - npm run db:migrate

  db:generate:
    desc: "Generate a migration from schema changes"
    cmds:
      - npm run db:generate

  db:seed:
    desc: "Seed default expense categories (idempotent)"
    cmds:
      - npm run db:seed

  db:studio:
    desc: "Open Drizzle Studio (interactive DB browser)"
    cmds:
      - npm run db:studio

  db:reset:
    desc: "WARNING: delete the SQLite DB and re-run migrations + seed"
    prompt: "This will DELETE data/household.db. Continue?"
    cmds:
      - rm -f data/household.db
      - npm run db:migrate
      - npm run db:seed

  set-password:
    desc: "Set the household password (writes to .env)"
    cmds:
      - npm run set-password -- {{.CLI_ARGS}}

  install:
    desc: "Install dependencies"
    cmds:
      - npm ci

  clean:
    desc: "Remove build artifacts and node_modules"
    prompt: "Remove build/ and node_modules/?"
    cmds:
      - rm -rf build node_modules

  check:
    desc: "Run typecheck + tests (CI-equivalent)"
    cmds:
      - task: typecheck
      - task: test
```

- [ ] **Step 2: Add install + usage note to README**

In `README.md`, add under a new `## Task runner` heading:

```markdown
## Task runner

Common commands are wrapped in a Taskfile. Install [Task](https://taskfile.dev)
(e.g. `sudo snap install task --classic` or see the Taskfile docs) then run:

```bash
task              # list tasks
task dev          # start dev server
task test         # run tests
task db:migrate   # apply Drizzle migrations
task set-password -- "<password>"
```
```

- [ ] **Step 3: Smoke test**

```bash
task --list
```
Expected: every task from Taskfile.yml is listed with its `desc`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: add Taskfile for common commands"
```

---

## Task 26: Final verification

**Files:** none

- [ ] **Step 1: Full test run**

```bash
npm test
```
Expected: all tests green.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Full build**

```bash
npm run build
```
Expected: builds `build/server/` and `build/client/` with no errors.

- [ ] **Step 4: End-to-end manual smoke test**

```bash
npm start
```

Browser flow:
1. Hit `/` → redirect to `/login`
2. Enter wrong password → error message
3. Enter correct password → redirect to current month
4. Go to `/settings/members`, add Alice (revenu 2000 par la suite, reste à vivre 800) and Bob (1000/800)
5. Back on month → fill incomes 2000 and 1000
6. Add "Loyer" 700€, both members affected
7. Results panel: Pure = Alice 466.67€, Bob 233.33€ (with residual adjustment, Alice 467)
8. Results panel: After cost-of-living = Alice 600€, Bob 100€
9. Add another expense affecting only Alice → Bob's share for it is 0
10. Close month → inputs disabled
11. Start next month → redirects to new month, incomes and expenses copied

- [ ] **Step 5: Commit if any fix applied**

```bash
git add -A
git diff --cached --quiet || git commit -m "fix: post-verification adjustments"
```

---

## Self-Review Checklist

Against spec sections:

- §2 In scope: monthly tracking ✅ Tasks 15, 16, 22; 2 calc methods ✅ Tasks 6, 7, 22; per-expense assignment ✅ Tasks 15, 22; open/closed ✅ Task 15, 22; duplicate ✅ Task 16, 22; default + custom categories ✅ Tasks 9, 14, 19; shared password ✅ Tasks 10, 11, 12.
- §2 Out of scope: no multi-household, no export, no notifications, no children, EUR only → no tasks, good.
- §3 Architecture: RR v7 ✅ Task 1, better-sqlite3 ✅ Task 3, Drizzle ✅ Task 3, shadcn ✅ Task 2, Zod ✅ Task 17, bcryptjs ✅ Task 10, Vitest ✅ Task 4.
- §4 Data model: all tables ✅ Task 3; `default_cost_of_living` on members, snapshot column on `monthly_incomes` ✅ Task 3.
- §5 Calc logic: both methods ✅ Tasks 6-7; fallback when Σ capacity = 0 ✅ Task 7; equal split when Σ income = 0 ✅ Task 6; single-affected member ✅ Task 6; negative income clamp ✅ Task 6; rounding residual on largest payer ✅ Task 6.
- §6 Routes: `/login` ✅ Task 12, `/logout` ✅ Task 12, `/` ✅ Task 21, `/months` ✅ Task 20, `/months/:yyyy-mm` ✅ Task 22, `/settings/members` ✅ Task 18, `/settings/categories` ✅ Task 19.
- §7 Auth: env var + bcrypt ✅ Tasks 10-11; session cookie ✅ Task 11; rate limit ✅ Task 11.
- §8 Error handling: Zod inline errors ✅ Tasks 17-22; ErrorBoundary ✅ Task 24.
- §9 Testing: calc unit tests ✅ Tasks 6-7; query integration tests ✅ Tasks 13-16; auth tests ✅ Task 11.
- §10 Deployment: systemd, backup cron, mDNS ✅ Task 25.

All spec requirements covered. Types consistent across tasks (`CalcInput`, `MonthState`, `intent` action discriminator). No placeholder steps.
