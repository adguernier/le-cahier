import { formatEuros } from "~/lib/money";
import type { CalcResult, Share } from "~/lib/calc";
import type { MonthState } from "~/lib/queries.server";

type Income = MonthState["incomes"][number];

export function MonthlySummary({
  incomes,
  results,
  memberName,
}: {
  incomes: Income[];
  results: CalcResult;
  memberName: (id: number) => string;
}) {
  const hasAnything =
    incomes.some((i) => i.amount > 0) ||
    results.proportional.some((s) => s.total > 0) ||
    results.individualTotals.some((s) => s.total > 0);
  if (!hasAnything) return null;

  const incomeBy = new Map(incomes.map((i) => [i.memberId, i.amount]));

  return (
    <section
      className="rise rise-4 rounded-md border border-rule-strong bg-paper-raised px-6 py-8 sm:px-10 sm:py-10"
      aria-labelledby="summary-title"
    >
      <div className="mb-8">
        <p className="eyebrow">Bilan mensuel</p>
        <h2
          id="summary-title"
          className="mt-2 font-heading text-3xl leading-tight text-ink"
        >
          Ce qu'il reste à chacun
        </h2>
      </div>

      <div className="grid gap-10 md:grid-cols-2">
        <SummaryColumn
          title="Proportionnelle pure"
          hint="reste = revenu − part commune (base revenu) − individuel"
          incomeBy={incomeBy}
          common={results.proportional}
          individual={results.individualTotals}
          memberName={memberName}
        />
        <SummaryColumn
          title="Après reste à vivre"
          hint="même calcul, base après reste à vivre"
          incomeBy={incomeBy}
          common={results.afterCostOfLiving}
          individual={results.individualTotals}
          memberName={memberName}
        />
      </div>
    </section>
  );
}

function SummaryColumn({
  title,
  hint,
  incomeBy,
  common,
  individual,
  memberName,
}: {
  title: string;
  hint: string;
  incomeBy: Map<number, number>;
  common: Share[];
  individual: Share[];
  memberName: (id: number) => string;
}) {
  const individualBy = new Map(individual.map((s) => [s.memberId, s.total]));
  const rows = common
    .map((s) => {
      const income = incomeBy.get(s.memberId) ?? 0;
      const indiv = individualBy.get(s.memberId) ?? 0;
      const owed = s.total + indiv;
      return {
        memberId: s.memberId,
        income,
        common: s.total,
        individual: indiv,
        owed,
        remaining: income - owed,
      };
    })
    .filter((r) => r.income > 0 || r.owed > 0);

  return (
    <div>
      <h3 className="font-heading text-lg text-ink">{title}</h3>
      <p className="mt-1 max-w-[36ch] text-xs text-ink-soft">{hint}</p>
      <ul className="mt-5 divide-y divide-rule border-t border-rule">
        {rows.map((r) => (
          <li key={r.memberId} className="py-4">
            <p className="font-heading text-base text-ink">
              {memberName(r.memberId)}
            </p>
            <dl className="mt-2 space-y-1 text-sm text-ink-soft">
              <div className="flex items-baseline justify-between gap-4">
                <dt>Revenu</dt>
                <dd className="num text-ink">{formatEuros(r.income)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt>Compte commun</dt>
                <dd className="num text-ink">−{formatEuros(r.common)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt>Individuel</dt>
                <dd className="num text-ink">−{formatEuros(r.individual)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 pt-1 text-ink-soft">
                <dt>Total dû</dt>
                <dd className="num">{formatEuros(r.owed)}</dd>
              </div>
            </dl>
            <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-rule pt-2">
              <span className="eyebrow">Reste</span>
              <span
                className={`num font-heading text-2xl ${
                  r.remaining < 0 ? "text-danger" : "text-accent"
                }`}
              >
                {formatEuros(r.remaining)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
