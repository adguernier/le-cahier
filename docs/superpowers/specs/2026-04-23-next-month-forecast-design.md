# Next-Month Forecast (Brouillon) — Design

**Date:** 2026-04-23
**Status:** Approved design, ready for implementation planning

## 1. Purpose

Household members fill the shared notebook during the current month. They also
want a forecast for the next month so they can anticipate how much each person
will have to transfer to the joint account. The forecast must be editable — a
member should be able to add a one-off upcoming expense (e.g. a birthday gift
planned for next month) without polluting the current month's data.

The feature introduces a **draft next month** that is created lazily from the
recurring expenses and incomes of the current month. The draft is a real
`months` row so it can be edited independently; it becomes the current open
month automatically at calendar rollover.

## 2. Scope

### In scope
- New `recurring` boolean flag on each expense, with opt-in default.
- New `draft` value in the `months.status` enum.
- Lazy materialisation of the next month as a `draft`, seeded from the current
  month's recurring expenses and all incomes.
- A read-only preview block on the current month's page summarising the
  forecast (reads from the draft if it exists, otherwise computes on the fly
  from the recurring expenses).
- Full editing of the draft through the existing `/months/:yyyy-mm` route.
- Automatic rollover at calendar month change (applied at loader time in
  `home.tsx`), including gap-fill for months the user skipped.

### Out of scope
- Planned-vs-actual variance tracking (the draft **becomes** actuals at
  rollover; there is no parallel "planned" data kept alongside the actual
  month).
- Cron/scheduled jobs — rollover runs in the `/` loader, not on a timer.
- Back-filling the `recurring` flag automatically on existing expenses (users
  tag manually after migration).
- Multi-month drafts (there is never a draft of a draft).
- Notifications or reminders derived from the forecast.

## 3. Data Model

### 3.1 `months.status` enum

Existing: `"open" | "closed"`.
New: `"draft" | "open" | "closed"`.

No SQL change required — SQLite stores the column as `text` with no `CHECK`
constraint. Only the Drizzle TypeScript enum widens.

### 3.2 `expenses.recurring`

New column:

```sql
ALTER TABLE expenses ADD COLUMN recurring INTEGER NOT NULL DEFAULT 0;
```

`0` = one-off (default), `1` = recurring. All existing rows migrate to `0`.
The flag is independent of the common/individual classification derived from
`expenseMembers` count — a recurring individual expense (e.g. Alice's phone
subscription) and a recurring common expense (e.g. rent) are both valid.

### 3.3 No other schema change

`monthlyIncomes`, `expenseMembers`, `members`, `categories` unchanged.

## 4. Status Transition & Rollover

All transitions happen inside a single pure function
`applyRollover(today: Date)` called from `home.tsx`'s loader before the
redirect. Extracting it as a function (rather than inlining in the loader)
makes it unit-testable and future-proofs a cron/endpoint invocation.

### Algorithm

Let `target = (today.year, today.month)` and `latest = latest month row in DB`.

1. If no months exist: `createMonth(target.year, target.month)` empty
   (status `open`), done.
2. Otherwise, walk month-by-month from `nextMonth(latest)` up to `target`:
   - For each intermediate month (strictly before `target`) that does not
     already exist in DB: create it via a copy of the previous month's
     recurring expenses + all incomes, status `closed`.
   - For `target`: if absent, create the same way with status `open`; if
     present as `draft`, flip its status to `open`; if present as
     `open`/`closed`, leave it.
3. Close any month currently `open` whose `(year, month) < target`.

The walk relies on `nextMonth(year, month)` (already in `month-utils.ts`).

### Worked examples

- **Nothing to do** (most common): `latest = target`, both `open`. Steps 2 and
  3 are no-ops.
- **Normal rollover**: `latest = April open`, `target = May`, a `May draft`
  exists because the user consulted the forecast during April. Step 2 flips
  May from `draft` to `open`. Step 3 closes April.
- **Gap rollover**: `latest = March open`, `target = May`. Step 2 creates
  April (copy of March recurring + incomes, status `closed`) then creates May
  (copy of April recurring + incomes, status `open`). Step 3 closes March
  (it was `open` and `(year, month) < target`).
- **First ever launch**: DB empty. Step 1 creates May empty.

### Edge cases

- Concurrent requests: SQLite serialises writes, and each create is preceded
  by an existence check; in practice no double-creation.
- Timezone: `applyRollover` uses the server's local `new Date()`, matching the
  current behaviour of `home.tsx`. Single-tenant app; acceptable.
- Manual early close: the existing `closeMonth` action (button on the month
  detail page) continues to work and sets the status to `closed` directly. A
  closed month never interferes with the rollover.

## 5. Draft Materialisation

### 5.1 `ensureDraft(currentMonthId: number) → Month`

New function in `queries.server.ts`. Returns the draft for the calendar month
following `currentMonth(currentMonthId)`:

1. Compute `(nextYear, nextMonth)` via `nextMonth(current.year, current.month)`.
2. If a `months` row exists for `(nextYear, nextMonth)`: return it (any status).
3. Otherwise:
   - Insert `months (year=nextYear, month=nextMonth, status="draft")`.
   - Copy every `expenses` row belonging to `currentMonthId` with
     `recurring=1`. For each copy, preserve `label`, `amount`, `categoryId`,
     `recurring=1`, and copy the matching `expenseMembers` rows.
   - Copy every `monthlyIncomes` row belonging to `currentMonthId`
     (`amount`, `costOfLiving`) verbatim.
   - Return the new row.

The `recurring=1` flag propagates into the new month's expenses, so once that
month becomes `open` at rollover it will, in turn, seed its own draft through
the same mechanism — the chain is self-sustaining.

`ensureDraft` is idempotent: calling it twice returns the same row (step 2).

### 5.2 Trigger points

1. **Loader of `/months/:yyyy-mm`** (existing `month-detail.tsx` route). If
   the URL corresponds to `nextMonth(latestOpen)` and no row exists in DB, the
   loader calls `ensureDraft(latestOpen.id)` before loading state. Other
   missing months (far future, non-adjacent) return 404 as today.
2. **`<Link>` on the preview block** on the current month page. No server
   action needed — the user clicks, the loader for the destination URL
   materialises on demand.

Preview-block rendering itself never triggers materialisation (it falls back
to a computed forecast — see §6).

### 5.3 `getForecastInput(currentMonthId: number) → CalcInput`

Helper in `queries.server.ts` used only when the preview block needs to
compute without a materialised draft. Returns a synthetic `CalcInput` with
the current month's active members, the current month's `monthlyIncomes`, and
only the expenses with `recurring=1` (mapped to `CalcExpense` with their
`expenseMembers`).

## 6. UI — Current Month Page

### 6.1 Preview block

New section in `app/routes/month-detail.tsx`, rendered **only** when
`state.month.status === "open"` (not shown on closed months, not shown on the
draft page itself).

Placement: below the results card (`À verser au compte commun`) and above the
closing footer.

Content logic:

- If a draft already exists for `nextMonth(state.month)`:
  - Load the draft's `expenses` + `incomes` in the loader (new helper
    `getMonthState(draft.id)` reuses existing code).
  - Run `calculate(draftInput)` to get `CalcResult`.
- Else, if the current month has ≥1 expense with `recurring=1`:
  - Build `getForecastInput(currentMonthId)` in the loader.
  - Run `calculate(forecastInput)`.
- Else: render an educational empty state (see below).

Visual layout:

```
Prévisionnel — Mai 2026                              [Éditer →]
À verser au compte commun (prévu)
  Alice   420,00 €
  Bob     280,00 €
Dépenses récurrentes: 4 · Total commun prévu: 700,00 €
```

- Heading: eyebrow `"Prévisionnel"`, H3 with `monthLabel(next.year, next.month)`.
- Single column showing `proportional` shares (to keep the block compact and
  avoid duplicating the full two-column results above).
- Footer line with the count of recurring common expenses and their summed
  common total.
- Link `"Éditer →"` pointing to `/months/{formatYyyyMm(next.year, next.month)}`
  — a plain `<Link>`, no form/action. The destination loader will call
  `ensureDraft` if needed.

Empty state (no draft + no recurring expenses):

> **Prévisionnel**
> Marque tes dépenses régulières comme *récurrentes* pour voir apparaître le
> prévisionnel du mois suivant.

No link, no numbers.

### 6.2 Expense form (add + edit)

Add a labelled checkbox `"Récurrente"` to the expense form, next to the
existing "Concernés" group. Default unchecked. The flag is persisted through
both `addExpense` and `updateExpense` (both helpers already exist — extend
their `input` shape).

### 6.3 Expense list rows

Small visual marker on each expense row whose `recurring=1` (e.g. a `↻` glyph
or a muted `rec` badge near the label) so members can tell at a glance which
expenses feed the forecast. Placement to be refined during implementation;
not load-bearing.

## 7. UI — Draft Month Page

Same route file (`app/routes/month-detail.tsx`), same URL scheme
(`/months/:yyyy-mm`). The loader distinguishes draft vs open purely by
reading the month's `status`.

### 7.1 Loader extension

Before the existing `getMonthState` call, the loader:

1. Parses `yyyy-mm` to `(year, month)`.
2. Looks up the row.
3. If missing **and** `(year, month) === nextMonth(latestOpen)`: calls
   `ensureDraft(latestOpen.id)`.
4. If still missing: 404.
5. Otherwise loads state as before.

### 7.2 Rendering differences when `state.month.status === "draft"`

- Page eyebrow changes from `"Mois en cours"` to `"Prévisionnel"`.
- `MonthStatusBadge` renders a new `"Brouillon"` variant (colour style to be
  picked from the existing palette — proposal: `paper-sunken` bg, `ink-soft`
  text, matching the muted feel of other low-emphasis states).
- All editing actions remain available (`isClosed === false`).
- **Hidden on drafts:**
  - The "Clôturer le mois" button (rollover handles it).
  - The preview block (no cascading forecast from a draft).
  - The legacy "Dupliquer vers le mois suivant" action (removed entirely —
    see §9).
- Revenus section, expenses sub-lists, and results card render normally.

### 7.3 Months list (`/months`)

The draft appears as a regular row. `MonthStatusBadge` shows "Brouillon". The
total column sums the draft's expenses (consistent with other months). No
special sort; orders stay `(year DESC, month DESC)`.

## 8. Calculation

`calculate()` is not modified. The existing common/individual classification
(derived from `expenseMembers.length`) applies unchanged to draft expenses.

Two new `calculate()` call sites:
1. Draft month rendering (reuses the existing results card).
2. Forecast preview block on the current month (uses either the draft state
   or `getForecastInput(currentMonthId)`).

## 9. Compatibility & Cleanup

### Migration

One Drizzle migration file:

```sql
ALTER TABLE expenses ADD COLUMN recurring INTEGER NOT NULL DEFAULT 0;
```

No data backfill. Users tag existing expenses as recurring manually during
their first pass — this is preferable to guessing from category names, which
would be fragile and silently wrong for edge cases (e.g. a one-off labelled
"Autre" charged to a "Courses" category).

### Removed user actions

- The manual "Dupliquer vers le mois suivant" button on the current month
  page is removed from the UI. Its purpose is superseded by automatic draft
  creation + rollover.
- The `duplicateMonth` function in `queries.server.ts` is **kept** (along
  with its tests) for now: it is a known, test-covered primitive that a
  future feature could reintroduce as a manual escape hatch. Cleanup is
  deferred to a separate change.

### Data compatibility

- Pre-existing `open` and `closed` months are untouched.
- No pre-existing drafts (the status value is new).
- Existing `expenseMembers` and `monthlyIncomes` rows carry over unchanged.

## 10. Testing

### 10.1 Unit — `tests/calc.test.ts`

No new cases. `calculate()` is unchanged.

### 10.2 Integration — `tests/queries.test.ts`

- `ensureDraft` copies only expenses with `recurring=1`; non-recurring
  expenses of the current month stay out.
- `ensureDraft` copies each surviving expense's `expenseMembers`.
- `ensureDraft` copies every `monthlyIncomes` row (amount + cost of living).
- `ensureDraft` is idempotent — the second call returns the same row and
  does not duplicate expenses or incomes.
- `ensureDraft` short-circuits (no new inserts) if a month already exists
  for the target `(year, month)` with any status.
- `getForecastInput` returns the current month's members, incomes, and only
  `recurring=1` expenses.

### 10.3 Rollover — `tests/queries.test.ts` (or new `tests/rollover.test.ts`)

`applyRollover(today)` as a pure function against an in-memory DB:

- No-op when the latest month matches `today`.
- Normal bascule: `draft` for `today` flips to `open`; previous `open`
  becomes `closed`.
- Gap-fill: latest = March `open`, `today` in May → April created+closed, May
  created `open`, March closed.
- DB empty: creates `today` as `open`, no copy.
- `open` month exists for `today`: no change.

### 10.4 Route smoke — `tests/smoke.test.ts`

- Preview block renders on a month with ≥1 recurring expense and hides
  otherwise (empty state message shown).
- Clicking the preview link lands on `/months/{next-yyyy-mm}` with a draft
  row created.
- Draft page: badge "Brouillon" visible, "Clôturer" button absent, preview
  block absent, expense form includes the "Récurrente" checkbox.
- Creating/editing an expense with "Récurrente" checked persists
  `recurring=1`.

## 11. Open Questions

None at design time. Implementation-time refinements allowed for:
- Exact visual treatment of the recurring marker on expense rows (§6.3).
- Exact colour token for the "Brouillon" badge variant (§7.2).
