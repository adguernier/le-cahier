import {
  Link,
  useActionData,
  useFetcher,
  useLoaderData,
} from "react-router";
import type { Route } from "./+types/month-detail";
import { requireAuth } from "~/lib/session.server";
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
import type { MonthState } from "~/lib/queries.server";
import { monthLabel, nextMonth, parseYyyyMm } from "~/lib/month-utils";
import { formatEuros } from "~/lib/money";
import { expenseSchema, incomeSchema } from "~/lib/validation";
import { calculate, type CalcInput } from "~/lib/calc";
import { Button } from "~/components/ui/button";
import { AppShell } from "~/components/app-shell";
import { MonthStatusBadge } from "~/components/month-status-badge";
import {
  ExpenseSubList,
  IndividualExpensesByMember,
} from "~/components/month/expense-list";
import { IncomeRow } from "~/components/month/income-row";
import { AddExpenseForm } from "~/components/month/add-expense-form";
import { ForecastPreview, type ForecastView } from "~/components/month/forecast-preview";

function toCalcInput(state: MonthState): CalcInput {
  return {
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
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);
  const { year, month } = parseYyyyMm(params.yyyymm!);

  let m = getMonth(year, month);

  if (!m) {
    const openMonths = listMonths().filter((x) => x.status === "open");
    const latestOpen = openMonths[0];
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

  const results = calculate(toCalcInput(state));

  let forecast: ForecastView | null = null;

  if (m.status === "open") {
    const next = nextMonth(year, month);
    const existingDraft = getMonth(next.year, next.month);
    if (existingDraft && existingDraft.status === "draft") {
      const draftState = getMonthState(existingDraft.id);
      forecast = {
        year: next.year,
        month: next.month,
        source: "draft",
        result: calculate(toCalcInput(draftState)),
        recurringCount: draftState.expenses.filter(
          (e) => e.memberIds.length >= 2
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

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);
  const { year, month } = parseYyyyMm(params.yyyymm!);
  const m = getMonth(year, month);
  if (!m) throw new Response("Month not found", { status: 404 });

  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (m.status === "closed") {
    return { error: "Mois clôturé, lecture seule." };
  }

  if (intent === "updateIncome") {
    const memberId = Number(formData.get("memberId"));
    const parsed = incomeSchema.safeParse({
      amount: formData.get("amount"),
      costOfLiving: formData.get("costOfLiving"),
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    updateIncome(m.id, memberId, parsed.data);
    return { ok: true };
  }

  if (intent === "addExpense") {
    const parsed = expenseSchema.safeParse({
      label: formData.get("label"),
      amount: formData.get("amount"),
      categoryId: formData.get("categoryId"),
      memberIds: formData.getAll("memberIds"),
      recurring: formData.get("recurring") ?? undefined,
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    addExpense(m.id, parsed.data);
    return { ok: true };
  }

  if (intent === "updateExpense") {
    const id = Number(formData.get("id"));
    const parsed = expenseSchema.safeParse({
      label: formData.get("label"),
      amount: formData.get("amount"),
      categoryId: formData.get("categoryId"),
      memberIds: formData.getAll("memberIds"),
      recurring: formData.get("recurring") ?? undefined,
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    updateExpense(id, parsed.data);
    return { ok: true };
  }

  if (intent === "deleteExpense") {
    deleteExpense(Number(formData.get("id")));
    return { ok: true };
  }

  if (intent === "closeMonth") {
    closeMonth(m.id);
    return { ok: true };
  }

  return { error: "Unknown intent" };
}

export default function MonthDetail() {
  const { state, members, categories, results, forecast } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const isClosed = state.month.status === "closed";
  const memberById = new Map(members.map((m) => [m.id, m]));
  const memberName = (id: number) =>
    state.incomes.find((i) => i.memberId === id)?.name ?? `#${id}`;

  const totalIncome = state.incomes.reduce((s, i) => s + i.amount, 0);
  const commonExpenses = state.expenses.filter((e) => e.memberIds.length >= 2);
  const individualExpenses = state.expenses.filter(
    (e) => e.memberIds.length === 1
  );
  const totalCommon = commonExpenses.reduce((s, e) => s + e.amount, 0);
  const totalIndividual = individualExpenses.reduce((s, e) => s + e.amount, 0);
  const hasResults = results.proportional.length > 0 && totalCommon > 0;
  const hasIndividualTotals = results.individualTotals.some((t) => t.total > 0);
  const forecastTotal = forecast
    ? forecast.result.proportional.reduce((s, r) => s + r.total, 0)
    : 0;

  return (
    <AppShell>
      <div className="page space-y-14">
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

        {actionData?.error && (
          <p className="-mt-8 text-sm text-danger" role="alert">
            <span aria-hidden className="mr-2">—</span>
            {actionData.error}
          </p>
        )}

        <section className="rise rise-1" aria-labelledby="revenus-title">
          <div className="mb-5 flex items-baseline justify-between gap-4">
            <div>
              <p className="eyebrow">Revenus &amp; reste à vivre</p>
              <h2
                id="revenus-title"
                className="mt-1 font-heading text-2xl text-ink"
              >
                Qui gagne quoi
              </h2>
            </div>
            <p className="num text-sm text-ink-soft">
              <span className="eyebrow mr-2">total</span>
              <span className="text-ink">{formatEuros(totalIncome)}</span>
            </p>
          </div>

          {state.incomes.length === 0 ? (
            <p className="text-ink-soft">
              Aucun membre. Ajoutez-en depuis{" "}
              <Link
                to="/settings/members"
                className="text-ink underline underline-offset-4"
              >
                la page Membres
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y divide-rule border-t border-rule-strong">
              {state.incomes.map((i) => (
                <IncomeRow key={i.memberId} income={i} isClosed={isClosed} />
              ))}
            </ul>
          )}
        </section>

        <section className="rise rise-2" aria-labelledby="depenses-title">
          <div className="mb-5 flex items-baseline justify-between gap-4">
            <div>
              <p className="eyebrow">Dépenses du mois</p>
              <h2
                id="depenses-title"
                className="mt-1 font-heading text-2xl text-ink"
              >
                Ce qui est sorti
              </h2>
            </div>
          </div>

          <div className="space-y-10">
            <ExpenseSubList
              title="Dépenses communes"
              hint="partagées par le compte commun"
              total={totalCommon}
              expenses={commonExpenses}
              memberById={memberById}
              isClosed={isClosed}
              emptyLabel="Aucune dépense commune ce mois."
            />
            <IndividualExpensesByMember
              total={totalIndividual}
              expenses={individualExpenses}
              members={members}
              isClosed={isClosed}
            />
          </div>

          {!isClosed && (
            <AddExpenseForm
              categories={categories}
              incomes={state.incomes}
            />
          )}
        </section>

        <section
          className="rise rise-3 rounded-md border border-rule-strong bg-paper-raised px-6 py-8 sm:px-10 sm:py-10"
          aria-labelledby="results-title"
        >
          <div className="mb-8">
            <p className="eyebrow">Compte commun</p>
            <h2
              id="results-title"
              className="mt-2 font-heading text-3xl leading-tight text-ink"
            >
              À verser ce mois
            </h2>
          </div>

          {!hasResults ? (
            <p className="text-ink-soft">
              Renseignez les revenus et au moins une dépense commune pour voir
              apparaître les parts à verser.
            </p>
          ) : (
            <div className="grid gap-10 md:grid-cols-2">
              <ResultColumn
                title="Proportionnelle pure"
                hint="selon le revenu seul"
                rows={results.proportional}
                memberName={memberName}
              />
              <ResultColumn
                title="Après reste à vivre"
                hint="selon le revenu restant, une fois les charges de vie retirées"
                rows={results.afterCostOfLiving}
                memberName={memberName}
              />
            </div>
          )}
          {hasIndividualTotals && (
            <div className="mt-10 border-t border-rule pt-6">
              <p className="eyebrow mb-2">Dépenses personnelles</p>
              <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-soft">
                {results.individualTotals
                  .filter((t) => t.total > 0)
                  .map((t) => (
                    <li key={t.memberId} className="num">
                      <span className="text-ink">{memberName(t.memberId)}</span>
                      <span className="mx-2">—</span>
                      <span className="text-ink">{formatEuros(t.total)}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </section>

        {state.month.status === "open" && forecast && (
          <ForecastPreview
            forecast={forecast}
            forecastTotal={forecastTotal}
            memberName={memberName}
          />
        )}

        <footer className="flex flex-wrap items-center justify-between gap-6 border-t border-rule pt-8 rise rise-4">
          <Link to="/months" className="text-sm text-ink-soft hover:text-ink underline-offset-4 hover:underline">
            ← Voir l’historique
          </Link>
          {state.month.status === "open" && <CloseMonthButton />}
        </footer>
      </div>
    </AppShell>
  );
}

function CloseMonthButton() {
  const fetcher = useFetcher<typeof action>();
  const isSubmitting = fetcher.state !== "idle";
  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="closeMonth" />
      <Button type="submit" variant="ghost" disabled={isSubmitting}>
        {isSubmitting ? "Clôture…" : "Clôturer le mois"}
      </Button>
    </fetcher.Form>
  );
}

function ResultColumn({
  title,
  hint,
  rows,
  memberName,
}: {
  title: string;
  hint: string;
  rows: ReadonlyArray<{ memberId: number; total: number }>;
  memberName: (id: number) => string;
}) {
  return (
    <div>
      <h3 className="font-heading text-lg text-ink">{title}</h3>
      <p className="mt-1 max-w-[36ch] text-xs text-ink-soft">{hint}</p>
      <ul className="mt-5 divide-y divide-rule border-t border-rule">
        {rows.map((s) => (
          <li
            key={s.memberId}
            className="flex items-baseline justify-between gap-4 py-3"
          >
            <span className="text-ink">{memberName(s.memberId)}</span>
            <span className="num font-heading text-2xl text-accent">
              {formatEuros(s.total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
