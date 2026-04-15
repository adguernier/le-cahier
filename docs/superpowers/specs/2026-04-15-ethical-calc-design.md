# Ethical Calc — Design Document

**Date:** 2026-04-15
**Status:** Approved design, ready for implementation planning

## 1. Purpose

Self-hosted web app for a single household to compute each member's fair
contribution to shared monthly expenses based on their income. Offers two
ethical calculation methods side-by-side so members can choose what feels
equitable.

Target deployment: Raspberry Pi on a home LAN, one instance per household.

## 2. Scope

### In scope
- Monthly tracking of members' incomes and shared household expenses
- Two calculation methods shown in parallel
- Per-expense member assignment (not every expense concerns every member)
- Monthly history with open/closed status and duplication from previous month
- Default + custom expense categories
- Single shared household password for LAN access

### Out of scope (YAGNI)
- Multi-household per instance
- Export (PDF, CSV), email notifications
- Children or non-active members (tool assumes active adults only)
- Currencies other than EUR
- Per-user accounts / per-member authentication

## 3. Architecture

```
Raspberry Pi (home LAN)
├── React Router v7 (framework mode, SSR)
├── Node.js 20+ runtime
├── better-sqlite3 (synchronous)
├── Drizzle ORM + drizzle-kit migrations
├── shadcn/ui + Tailwind CSS
├── Zod for form validation
└── data/household.db (persistent volume)
```

### Project structure
```
app/
  routes/           # pages + actions
  lib/
    db.ts           # SQLite connection
    schema.ts       # Drizzle tables
    calc.ts         # pure calculation logic
    auth.ts         # session + password
  components/       # shadcn + custom
data/
  household.db      # gitignored
migrations/
```

## 4. Data model

All monetary amounts stored as **integer cents** to avoid floating-point
issues.

```sql
members (
  id                     INTEGER PRIMARY KEY,
  name                   TEXT NOT NULL,
  default_cost_of_living INTEGER NOT NULL,  -- default minimum vital, cents
  created_at             INTEGER NOT NULL,
  archived_at            INTEGER             -- soft-delete, preserves history
)

categories (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  is_default INTEGER NOT NULL DEFAULT 0
)

months (
  id     INTEGER PRIMARY KEY,
  year   INTEGER NOT NULL,
  month  INTEGER NOT NULL,            -- 1..12
  status TEXT NOT NULL,                -- 'open' | 'closed'
  UNIQUE(year, month)
)

monthly_incomes (
  month_id       INTEGER NOT NULL REFERENCES months(id),
  member_id      INTEGER NOT NULL REFERENCES members(id),
  amount         INTEGER NOT NULL,  -- income for this month, cents
  cost_of_living INTEGER NOT NULL,  -- snapshot at month creation, cents
  PRIMARY KEY (month_id, member_id)
)

expenses (
  id          INTEGER PRIMARY KEY,
  month_id    INTEGER NOT NULL REFERENCES months(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  label       TEXT NOT NULL,
  amount      INTEGER NOT NULL
)

expense_members (
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  member_id  INTEGER NOT NULL REFERENCES members(id),
  PRIMARY KEY (expense_id, member_id)
)
```

### Default categories
Seeded at first boot: Loyer, Électricité, Gaz, Internet, Eau, Courses,
Assurance, Autre. Users may add/delete custom categories. Default categories
cannot be deleted but can be renamed.

### Income and cost-of-living snapshotting
`monthly_incomes` stores both `amount` and `cost_of_living` per
(month, member). At month creation these are copied from the member's
current defaults (or from the previous month when duplicating). This
isolates each month from later edits to `members` and guarantees closed
months display stable, immutable figures.

For open months, users may edit `monthly_incomes.amount` and
`monthly_incomes.cost_of_living` directly in the dashboard. For closed
months, both are read-only.

`members.default_cost_of_living` is only used as a seed when a new member
row participates in a new month for the first time.

## 5. Calculation logic

Implemented as a pure function in `lib/calc.ts` with zero DB dependency.
100% unit-testable.

### Input
```ts
type CalcInput = {
  members: {
    id: number
    name: string
    income: number        // cents
    costOfLiving: number  // cents
  }[]
  expenses: {
    id: number
    amount: number        // cents
    memberIds: number[]   // members affected by this expense
  }[]
}
```

### Method 1 — Pure proportional
For each expense, among affected members only:
```
share(member) = expense_amount × income(member) / Σ income(affected)
```

### Method 2 — Proportional after cost-of-living
For each expense, among affected members only:
```
capacity(member) = max(0, income(member) − costOfLiving(member))
share(member)    = expense_amount × capacity(member) / Σ capacity(affected)
```

### Edge cases
- **Σ capacity = 0** (all affected members below cost-of-living threshold):
  fall back to pure proportional for that expense.
- **Σ income = 0** among affected: equal split.
- **Single affected member:** pays 100%.
- **Negative income:** clamp to 0 before computation.
- **Rounding:** compute in cents with `Math.round`. Residual (±N cents)
  adjusted on the largest payer so Σ shares exactly equals expense.

### Output
```ts
type CalcResult = {
  proportional:      { memberId: number; total: number }[]
  afterCostOfLiving: { memberId: number; total: number }[]
  byExpense: {
    expenseId: number
    proportional:      { memberId: number; share: number }[]
    afterCostOfLiving: { memberId: number; share: number }[]
  }[]
}
```

## 6. Routes & UX

```
/login                   POST password → session cookie
/                        Dashboard (current open month)
/months                  Historical list
/months/:yyyy-mm         Month detail (read-only if closed)
/settings/members        CRUD members + default cost-of-living
/settings/categories     CRUD categories
/logout
```

**Authentication middleware:** every route except `/login` verifies session
cookie, redirects to `/login` otherwise.

### Dashboard page (`/`)
1. **Header** — current month label ("Avril 2026") + status badge
2. **Members & incomes block** — inline-editable table showing each active
   member with their income and cost-of-living **for this month** (seeded
   from member defaults or previous month)
3. **Expenses block** — table (category, label, amount, affected members
   checkboxes) + "Add expense" button opening a Dialog
4. **Results block** — two columns side-by-side:
   - Pure proportional
   - After cost-of-living
   Each showing total per member. Collapsible per-expense detail.
5. **Actions**
   - "Close month" — sets status = closed, locks editing
   - "Start new month" — creates next month, duplicates members/incomes
     and all expenses from previous month (user then adjusts)

### Month detail (`/months/:yyyy-mm`)
- Closed → read-only view of the same blocks
- Open → same as dashboard

### Months list (`/months`)
- Reverse-chronological table: year, month, status, total expenses
- Click navigates to detail

### Forms
- React Router `action` functions handle all mutations
- Zod schemas validate inputs server-side
- Post-Redirect-Get pattern after successful actions
- Field errors rendered inline

### UI components (shadcn/ui)
Core: `Table`, `Dialog`, `Checkbox`, `Input`, `Button`, `Card`, `Badge`,
`Tabs` (method switch on mobile), `Sonner` (toasts).

## 7. Authentication

Single shared household password.

- Password hash stored as env var `HOUSEHOLD_PASSWORD_HASH` (bcrypt)
- Set via CLI script: `npm run set-password`
- Session cookie via React Router's `createCookieSessionStorage`:
  - Signed with `SESSION_SECRET` env var
  - httpOnly, sameSite=lax, Secure=false (LAN, no HTTPS required)
  - 30-day validity
- Rate limit on `/login`: 5 attempts per 15 minutes per IP (in-memory
  `Map`, sufficient for LAN use)

## 8. Error handling

- **Zod validation** on every action → inline field errors
- **Global ErrorBoundary** in React Router → generic error page + server log
- **Business rule violations** (e.g., closing a month with no expenses) →
  toast error, action rejected
- **DB errors** → log stack trace server-side, return 500 with generic
  message (no leak of internals)

## 9. Testing

- **`lib/calc.ts`** — Vitest unit tests covering:
  - Both methods, happy path
  - Σ capacity = 0 fallback
  - Σ income = 0 equal split
  - Single affected member
  - Negative income clamp
  - Rounding adjustment
- **Route actions** — integration tests with `:memory:` SQLite DB
- **E2E (nice-to-have)** — Playwright, happy path: login → add expense →
  view calculation
- **No UI unit tests** for shadcn components (tested upstream)

## 10. Deployment (Raspberry Pi)

- Node.js 20+ LTS (via nvm or nodesource)
- Build: `npm run build`
- systemd unit `ethical-calc.service`:
  ```
  [Unit]
  Description=Ethical Calc household app
  After=network.target

  [Service]
  ExecStart=/usr/bin/node /home/pi/ethical-calc/build/server/index.js
  WorkingDirectory=/home/pi/ethical-calc
  Restart=on-failure
  EnvironmentFile=/home/pi/ethical-calc/.env

  [Install]
  WantedBy=multi-user.target
  ```
- DB path: `/home/pi/ethical-calc/data/household.db`
- Backup cron (daily):
  ```
  0 3 * * * sqlite3 /home/pi/ethical-calc/data/household.db \
    ".backup /home/pi/backups/household-$(date +\%F).db"
  ```
- Access: `http://raspberrypi.local:3000` (mDNS) or fixed LAN IP

## 11. Open questions

None — all blocking design questions resolved during brainstorming.
