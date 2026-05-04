import { formatEuros } from "~/lib/money";
import type { CalcResult, Share } from "~/lib/calc";

export function MonthlySummary({
  results,
  memberName,
}: {
  results: CalcResult;
  memberName: (id: number) => string;
}) {
  const hasIndividual = results.individualTotals.some((t) => t.total > 0);
  if (!hasIndividual) return null;

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
          Total à charge ce mois
        </h2>
      </div>

      <div className="grid gap-10 md:grid-cols-2">
        <SummaryColumn
          title="Proportionnelle pure"
          hint="compte commun (base revenu) + dépenses individuelles"
          common={results.proportional}
          individual={results.individualTotals}
          memberName={memberName}
        />
        <SummaryColumn
          title="Après reste à vivre"
          hint="compte commun (après reste à vivre) + dépenses individuelles"
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
  common,
  individual,
  memberName,
}: {
  title: string;
  hint: string;
  common: Share[];
  individual: Share[];
  memberName: (id: number) => string;
}) {
  const individualBy = new Map(individual.map((s) => [s.memberId, s.total]));
  const rows = common
    .map((s) => {
      const indiv = individualBy.get(s.memberId) ?? 0;
      return {
        memberId: s.memberId,
        common: s.total,
        individual: indiv,
        total: s.total + indiv,
      };
    })
    .filter((r) => r.total > 0);

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
                <dt>Compte commun</dt>
                <dd className="num text-ink">{formatEuros(r.common)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt>Individuel</dt>
                <dd className="num text-ink">{formatEuros(r.individual)}</dd>
              </div>
            </dl>
            <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-rule pt-2">
              <span className="eyebrow">Total</span>
              <span className="num font-heading text-2xl text-accent">
                {formatEuros(r.total)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
