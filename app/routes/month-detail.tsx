import { Form, Link, redirect, useActionData, useLoaderData } from "react-router";
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
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
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
  const isClosed = state.month.status === "closed";
  const memberById = new Map(members.map((m) => [m.id, m]));

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">
          {monthLabel(state.month.year, state.month.month)}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <MonthStatusBadge status={state.month.status} />
          <Link className="text-sm underline" to="/months">
            Historique
          </Link>
          <Link className="text-sm underline" to="/settings/members">
            Membres
          </Link>
          <Link className="text-sm underline" to="/settings/categories">
            Catégories
          </Link>
          <Form method="post" action="/logout">
            <Button type="submit" variant="ghost" size="sm">
              Déconnexion
            </Button>
          </Form>
        </div>
      </div>

      {actionData?.error && (
        <p className="text-sm text-red-600">{actionData.error}</p>
      )}

      {/* Incomes */}
      <Card>
        <CardHeader>
          <CardTitle>Revenus & reste à vivre</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Membre</TableHead>
                <TableHead>Revenu (€)</TableHead>
                <TableHead>Reste à vivre (€)</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.incomes.map((i) => (
                <TableRow key={i.memberId}>
                  <TableCell className="font-medium">{i.name}</TableCell>
                  <TableCell colSpan={2}>
                    <Form method="post" className="flex gap-2">
                      <input type="hidden" name="intent" value="updateIncome" />
                      <input type="hidden" name="memberId" value={i.memberId} />
                      <Input
                        name="amount"
                        defaultValue={(i.amount / 100).toString()}
                        disabled={isClosed}
                        className="w-28"
                        placeholder="Revenu"
                      />
                      <Input
                        name="costOfLiving"
                        defaultValue={(i.costOfLiving / 100).toString()}
                        disabled={isClosed}
                        className="w-28"
                        placeholder="Reste à vivre"
                      />
                      {!isClosed && (
                        <Button type="submit" variant="outline" size="sm">
                          OK
                        </Button>
                      )}
                    </Form>
                  </TableCell>
                  <TableCell />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Expenses */}
      <Card>
        <CardHeader>
          <CardTitle>Dépenses</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Catégorie</TableHead>
                <TableHead>Libellé</TableHead>
                <TableHead>Montant</TableHead>
                <TableHead>Membres concernés</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.expenses.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.categoryName}</TableCell>
                  <TableCell>{e.label}</TableCell>
                  <TableCell>{formatEuros(e.amount)}</TableCell>
                  <TableCell>
                    {e.memberIds
                      .map((id) => memberById.get(id)?.name)
                      .filter(Boolean)
                      .join(", ")}
                  </TableCell>
                  <TableCell>
                    {!isClosed && (
                      <Form method="post">
                        <input
                          type="hidden"
                          name="intent"
                          value="deleteExpense"
                        />
                        <input type="hidden" name="id" value={e.id} />
                        <Button type="submit" variant="destructive" size="sm">
                          Suppr.
                        </Button>
                      </Form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {!isClosed && (
            <Form
              method="post"
              className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-6"
            >
              <input type="hidden" name="intent" value="addExpense" />
              <select
                name="categoryId"
                className="rounded border p-2"
                required
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Input name="label" placeholder="Libellé" required />
              <Input name="amount" placeholder="Montant €" required />
              <div className="col-span-2 flex flex-wrap gap-2">
                {state.incomes.map((i) => (
                  <label
                    key={i.memberId}
                    className="flex items-center gap-1 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="memberIds"
                      value={i.memberId}
                      defaultChecked
                    />
                    {i.name}
                  </label>
                ))}
              </div>
              <Button type="submit">Ajouter</Button>
            </Form>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle>Résultats</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-2 font-semibold">Proportionnelle pure</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Membre</TableHead>
                  <TableHead className="text-right">À payer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.proportional.map((s) => (
                  <TableRow key={s.memberId}>
                    <TableCell>
                      {state.incomes.find((i) => i.memberId === s.memberId)
                        ?.name ?? `#${s.memberId}`}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatEuros(s.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div>
            <h3 className="mb-2 font-semibold">Après reste à vivre</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Membre</TableHead>
                  <TableHead className="text-right">À payer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.afterCostOfLiving.map((s) => (
                  <TableRow key={s.memberId}>
                    <TableCell>
                      {state.incomes.find((i) => i.memberId === s.memberId)
                        ?.name ?? `#${s.memberId}`}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatEuros(s.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      {!isClosed && (
        <div className="flex gap-3">
          <Form method="post">
            <input type="hidden" name="intent" value="closeMonth" />
            <Button type="submit" variant="outline">
              Clôturer le mois
            </Button>
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
