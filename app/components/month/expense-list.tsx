import { useFetcher } from "react-router";
import { formatEuros } from "~/lib/money";
import type { MonthState } from "~/lib/queries.server";
import { Button } from "~/components/ui/button";

type MonthExpense = MonthState["expenses"][number];
type NamedMember = { id: number; name: string };

export function RecurringMarker() {
  return (
    <span
      className="ml-2 text-xs text-ink-soft"
      title="Dépense récurrente — reportée dans le prévisionnel"
      aria-label="récurrente"
    >
      ↻
    </span>
  );
}

export function DeleteExpenseButton({ id }: { id: number }) {
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";
  return (
    <fetcher.Form method="post" className="inline-block">
      <input type="hidden" name="intent" value="deleteExpense" />
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="destructive"
        size="sm"
        disabled={isSubmitting}
      >
        {isSubmitting ? "…" : "Supprimer"}
      </Button>
    </fetcher.Form>
  );
}

export function ExpenseSubList({
  title,
  hint,
  total,
  expenses,
  memberById,
  isClosed,
  emptyLabel,
}: {
  title: string;
  hint: string;
  total: number;
  expenses: MonthExpense[];
  memberById: Map<number, NamedMember>;
  isClosed: boolean;
  emptyLabel: string;
}) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <div>
          <h3 className="font-heading text-lg text-ink">{title}</h3>
          <p className="text-xs text-ink-soft">{hint}</p>
        </div>
        <p className="num text-sm text-ink-soft">
          <span className="eyebrow mr-2">sous-total</span>
          <span className="text-ink">{formatEuros(total)}</span>
        </p>
      </div>
      {expenses.length === 0 ? (
        <p className="text-sm italic text-ink-soft">{emptyLabel}</p>
      ) : (
        <ul className="divide-y divide-rule border-t border-rule-strong">
          {expenses.map((e) => (
            <li
              key={e.id}
              className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-6 gap-y-1 py-3 sm:grid-cols-[10ch_1fr_auto_auto]"
            >
              <span className="eyebrow">{e.categoryName}</span>
              <span className="text-ink">
                {e.label}
                {e.recurring === 1 && <RecurringMarker />}
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
        </ul>
      )}
    </div>
  );
}

export function IndividualExpensesByMember({
  total,
  expenses,
  members,
  isClosed,
}: {
  total: number;
  expenses: MonthExpense[];
  members: NamedMember[];
  isClosed: boolean;
}) {
  const byMember = new Map<number, MonthExpense[]>();
  for (const e of expenses) {
    const id = e.memberIds[0];
    if (id == null) continue;
    const list = byMember.get(id) ?? [];
    list.push(e);
    byMember.set(id, list);
  }

  const groups = members
    .map((m) => ({ member: m, items: byMember.get(m.id) ?? [] }))
    .filter((g) => g.items.length > 0);

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <div>
          <h3 className="font-heading text-lg text-ink">
            Dépenses individuelles
          </h3>
          <p className="text-xs text-ink-soft">
            à la charge d’une seule personne
          </p>
        </div>
        <p className="num text-sm text-ink-soft">
          <span className="eyebrow mr-2">sous-total</span>
          <span className="text-ink">{formatEuros(total)}</span>
        </p>
      </div>
      {groups.length === 0 ? (
        <p className="text-sm italic text-ink-soft">
          Aucune dépense individuelle ce mois.
        </p>
      ) : (
        <div className="space-y-6 border-t border-rule-strong">
          {groups.map((g) => {
            const memberTotal = g.items.reduce((s, e) => s + e.amount, 0);
            return (
              <div key={g.member.id} className="pt-4">
                <div className="mb-2 flex items-baseline justify-between gap-4">
                  <h4 className="font-heading text-base text-ink">
                    {g.member.name}
                  </h4>
                  <p className="num text-sm text-ink">
                    {formatEuros(memberTotal)}
                  </p>
                </div>
                <ul className="divide-y divide-rule">
                  {g.items.map((e) => (
                    <li
                      key={e.id}
                      className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-6 gap-y-1 py-3 sm:grid-cols-[10ch_1fr_auto_auto]"
                    >
                      <span className="eyebrow">{e.categoryName}</span>
                      <span className="text-ink">
                        {e.label}
                        {e.recurring === 1 && <RecurringMarker />}
                      </span>
                      <span className="num text-right text-ink">
                        {formatEuros(e.amount)}
                      </span>
                      <div className="col-span-3 flex justify-end sm:col-span-1">
                        {!isClosed && <DeleteExpenseButton id={e.id} />}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
