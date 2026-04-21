import { Form, Link, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/month-detail";
import { requireAuth } from "~/lib/session.server";
import {
  addExpense,
  closeMonth,
  deleteExpense,
  duplicateMonth,
  getMonth,
  getMonthState,
  listActiveMembers,
  listCategories,
  updateExpense,
  updateIncome,
} from "~/lib/queries.server";
import { formatYyyyMm, monthLabel, nextMonth, parseYyyyMm } from "~/lib/month-utils";
import { formatEuros } from "~/lib/money";
import { expenseSchema, incomeSchema } from "~/lib/validation";
import { calculate } from "~/lib/calc";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { AppShell } from "~/components/app-shell";
import { MonthStatusBadge } from "~/components/month-status-badge";

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);
  const { year, month } = parseYyyyMm(params.yyyymm!);
  const m = getMonth(year, month);
  if (!m) throw new Response("Month not found", { status: 404 });

  const state = getMonthState(m.id);
  const members = listActiveMembers();
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

  return { state, members, categories: cats, results };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);
  const { year, month } = parseYyyyMm(params.yyyymm!);
  const m = getMonth(year, month);
  if (!m) throw new Response("Month not found", { status: 404 });

  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (m.status === "closed" && intent !== "duplicateMonth") {
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
    return redirect(`/months/${params.yyyymm}`);
  }

  if (intent === "addExpense") {
    const parsed = expenseSchema.safeParse({
      label: formData.get("label"),
      amount: formData.get("amount"),
      categoryId: formData.get("categoryId"),
      memberIds: formData.getAll("memberIds"),
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    addExpense(m.id, parsed.data);
    return redirect(`/months/${params.yyyymm}`);
  }

  if (intent === "updateExpense") {
    const id = Number(formData.get("id"));
    const parsed = expenseSchema.safeParse({
      label: formData.get("label"),
      amount: formData.get("amount"),
      categoryId: formData.get("categoryId"),
      memberIds: formData.getAll("memberIds"),
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    updateExpense(id, parsed.data);
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

export default function MonthDetail() {
  const { state, members, categories, results } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isClosed = state.month.status === "closed";
  const memberById = new Map(members.map((m) => [m.id, m]));
  const memberName = (id: number) =>
    state.incomes.find((i) => i.memberId === id)?.name ?? `#${id}`;

  const totalIncome = state.incomes.reduce((s, i) => s + i.amount, 0);
  const totalExpenses = state.expenses.reduce((s, e) => s + e.amount, 0);
  const hasResults = results.proportional.length > 0 && totalExpenses > 0;

  return (
    <AppShell>
      <div className="page space-y-14">
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

        {actionData?.error && (
          <p className="-mt-8 text-sm text-danger" role="alert">
            <span aria-hidden className="mr-2">—</span>
            {actionData.error}
          </p>
        )}

        {/* --- Revenus --- */}
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
                <li key={i.memberId} className="py-4">
                  <Form method="post" className="grid grid-cols-1 items-baseline gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
                    <input type="hidden" name="intent" value="updateIncome" />
                    <input type="hidden" name="memberId" value={i.memberId} />
                    <p className="font-heading text-lg text-ink">{i.name}</p>
                    <IncomeField
                      name="amount"
                      label="Revenu"
                      defaultValue={i.amount}
                      disabled={isClosed}
                    />
                    <IncomeField
                      name="costOfLiving"
                      label="Reste à vivre"
                      defaultValue={i.costOfLiving}
                      disabled={isClosed}
                    />
                    <div className="pt-2 sm:pt-0">
                      {!isClosed && (
                        <Button type="submit" variant="outline" size="sm">
                          Enregistrer
                        </Button>
                      )}
                    </div>
                  </Form>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* --- Dépenses --- */}
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
            <p className="num text-sm text-ink-soft">
              <span className="eyebrow mr-2">total</span>
              <span className="text-ink">{formatEuros(totalExpenses)}</span>
            </p>
          </div>

          {state.expenses.length === 0 ? (
            <p className="mb-6 text-ink-soft">
              Rien n’est encore noté pour ce mois.
            </p>
          ) : (
            <ul className="divide-y divide-rule border-t border-rule-strong">
              {state.expenses.map((e) => (
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
                    {!isClosed && (
                      <Form method="post" className="inline-block">
                        <input
                          type="hidden"
                          name="intent"
                          value="deleteExpense"
                        />
                        <input type="hidden" name="id" value={e.id} />
                        <Button type="submit" variant="destructive" size="sm">
                          Supprimer
                        </Button>
                      </Form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!isClosed && (
            <Form
              method="post"
              className="mt-8 grid grid-cols-1 gap-5 border-t border-rule pt-6 sm:grid-cols-[10rem_1fr_9rem_auto]"
              aria-labelledby="add-expense-title"
            >
              <p
                id="add-expense-title"
                className="eyebrow sm:col-span-4 -mb-2"
              >
                Ajouter une dépense
              </p>
              <input type="hidden" name="intent" value="addExpense" />
              <div className="flex flex-col gap-1">
                <Label htmlFor="categoryId">Catégorie</Label>
                <select
                  id="categoryId"
                  name="categoryId"
                  required
                  className="border-0 border-b border-rule bg-transparent py-1.5 text-base text-ink outline-none focus:border-accent focus-visible:outline-none"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="expense-label">Libellé</Label>
                <Input
                  id="expense-label"
                  name="label"
                  placeholder="Ex : électricité"
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="expense-amount">Montant (€)</Label>
                <Input
                  id="expense-amount"
                  name="amount"
                  placeholder="0,00"
                  required
                  inputMode="decimal"
                  className="num"
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" variant="primary" className="w-full sm:w-auto">
                  Ajouter
                </Button>
              </div>
              <fieldset className="sm:col-span-4">
                <legend className="eyebrow mb-2">Concernés</legend>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {state.incomes.map((i) => (
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
            </Form>
          )}
        </section>

        {/* --- Résultats (hero) --- */}
        <section
          className="rise rise-3 rounded-md border border-rule-strong bg-paper-raised px-6 py-8 sm:px-10 sm:py-10"
          aria-labelledby="results-title"
        >
          <div className="mb-8">
            <p className="eyebrow">À payer ce mois</p>
            <h2
              id="results-title"
              className="mt-2 font-heading text-3xl leading-tight text-ink"
            >
              La part de chacun
            </h2>
          </div>

          {!hasResults ? (
            <p className="text-ink-soft">
              Renseignez les revenus et les dépenses pour voir apparaître les
              parts.
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
        </section>

        {/* --- Month actions --- */}
        <footer className="flex flex-wrap items-center justify-between gap-6 border-t border-rule pt-8 rise rise-4">
          <Link to="/months" className="text-sm text-ink-soft hover:text-ink underline-offset-4 hover:underline">
            ← Voir l’historique
          </Link>
          {!isClosed ? (
            <div className="flex flex-wrap items-center gap-6">
              <Form method="post">
                <input type="hidden" name="intent" value="closeMonth" />
                <Button
                  type="submit"
                  variant="ghost"
                  disabled={navigation.state === "submitting"}
                >
                  Clôturer le mois
                </Button>
              </Form>
              <Form method="post">
                <input type="hidden" name="intent" value="duplicateMonth" />
                <Button type="submit" variant="primary">
                  Démarrer le mois suivant
                </Button>
              </Form>
            </div>
          ) : (
            <Form method="post">
              <input type="hidden" name="intent" value="duplicateMonth" />
              <Button type="submit" variant="primary">
                Démarrer le mois suivant
              </Button>
            </Form>
          )}
        </footer>
      </div>
    </AppShell>
  );
}

function IncomeField({
  name,
  label,
  defaultValue,
  disabled,
}: {
  name: string;
  label: string;
  defaultValue: number;
  disabled: boolean;
}) {
  const id = `${name}-${defaultValue}`;
  return (
    <div className="flex flex-col gap-1 sm:w-32">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        defaultValue={(defaultValue / 100).toString()}
        disabled={disabled}
        inputMode="decimal"
        className="num text-right"
      />
    </div>
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
