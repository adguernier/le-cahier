# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## Project Context

**Ethical Calc** — household expense splitter. Each member pays proportionally to income; two calc methods displayed side-by-side. Self-hosted, French-language UI.

**Stack:** React Router 7 (SSR), TypeScript, Drizzle ORM + better-sqlite3, Vitest, Tailwind 4, shadcn/radix-ui, Zod.

**Layout:**
- `app/routes/` — React Router routes (loaders + actions)
- `app/lib/` — server logic: `queries.server.ts`, `auth.server.ts`, `calc.ts`, `money.ts`, `schema.ts` (Drizzle), `validation.ts` (Zod)
- `app/components/` — UI (shadcn-style)
- `tests/` — Vitest, mirrors `app/lib/` modules; `tests/helpers/` for fixtures
- `migrations/` — Drizzle SQL migrations
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — design specs and implementation plans

**Commands:**
- `npm run dev` — dev server on :5173
- `npm test` — run Vitest once (`npm run test:watch` for watch)
- `npm run typecheck` — typegen + tsc
- `npm run db:migrate` / `npm run db:generate` — apply / create Drizzle migrations
- `npm run db:seed` — seed defaults
- `task` — alternate runner (see `Taskfile.yml`)

**Money rule:** all amounts stored as integer cents. Never use floats. See `app/lib/money.ts`.

**Server-only files:** anything `*.server.ts` must not be imported from client components.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

**Example.** User says "add a recurring-expense toggle".
- Bad: silently pick monthly recurrence, add UI + DB + calc changes.
- Good: "Two interpretations: (a) flag only — repeats next month at user request; (b) auto-instantiate every month. Schema cost differs. Which?"

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

**Example.** Asked to add one query in `queries.server.ts`.
- Bad: introduce a generic `QueryBuilder<T>` class "for future queries".
- Good: add the function next to its siblings, same style.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

**Example.** Asked to fix a bug in `calc.ts:splitProportional`.
- Bad: also reformat the file, rename a nearby var, tweak an unrelated comment.
- Good: change only the buggy lines. If you spotted dead code, mention it in the reply — don't delete.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

**Example.** "Fix rollover for empty months."
1. Add failing test in `tests/rollover.test.ts` reproducing the empty-month case → verify: `npm test -- rollover` red on that case.
2. Patch `queries.server.ts` rollover logic → verify: same test green, full suite still green (`npm test`).
3. Typecheck → verify: `npm run typecheck` clean.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
