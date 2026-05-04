import { Link } from "react-router";
import { formatEuros } from "~/lib/money";
import { formatYyyyMm, monthLabel } from "~/lib/month-utils";
import type { CalcResult } from "~/lib/calc";

export type ForecastView = {
  year: number;
  month: number;
  source: "draft" | "computed";
  result: CalcResult;
  recurringCount: number;
};

export function ForecastPreview({
  forecast,
  forecastTotal,
  memberName,
}: {
  forecast: ForecastView;
  forecastTotal: number;
  memberName: (id: number) => string;
}) {
  return (
    <section className="rise rise-4" aria-labelledby="forecast-title">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <div>
          <p className="eyebrow">Prévisionnel</p>
          <h2
            id="forecast-title"
            className="mt-1 font-heading text-2xl text-ink"
          >
            {monthLabel(forecast.year, forecast.month)}
          </h2>
        </div>
        <Link
          to={`/months/${formatYyyyMm(forecast.year, forecast.month)}`}
          className="text-sm text-ink-soft hover:text-ink underline-offset-4 hover:underline"
        >
          Éditer →
        </Link>
      </div>

      {forecast.recurringCount === 0 ? (
        <p className="max-w-[56ch] text-sm text-ink-soft">
          Marque tes dépenses régulières comme <em>récurrentes</em> pour voir
          apparaître le prévisionnel du mois suivant.
        </p>
      ) : (
        <div>
          <p className="eyebrow mb-2">À verser au compte commun (prévu)</p>
          <ul className="divide-y divide-rule border-t border-rule">
            {forecast.result.proportional.map((s) => (
              <li
                key={s.memberId}
                className="flex items-baseline justify-between gap-4 py-3"
              >
                <span className="text-ink">{memberName(s.memberId)}</span>
                <span className="num font-heading text-xl text-accent">
                  {formatEuros(s.total)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-soft">
            Dépenses communes prévues: {forecast.recurringCount} · Total commun
            prévu: {formatEuros(forecastTotal)}
          </p>
        </div>
      )}
    </section>
  );
}
