import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/months";
import { requireAuth } from "~/lib/session.server";
import { getMonthState, listMonths } from "~/lib/queries.server";
import { formatYyyyMm, monthLabel } from "~/lib/month-utils";
import { formatEuros } from "~/lib/money";
import { AppShell } from "~/components/app-shell";
import { MonthStatusBadge } from "~/components/month-status-badge";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const all = listMonths();
  const rows = all.map((m) => {
    const state = getMonthState(m.id);
    const total = state.expenses.reduce((s, e) => s + e.amount, 0);
    return { ...m, total };
  });
  return { rows };
}

export default function MonthsList() {
  const { rows } = useLoaderData<typeof loader>();

  return (
    <AppShell>
      <div className="page">
        <header className="mb-10">
          <p className="eyebrow">Historique</p>
          <h1 className="mt-2 font-heading text-4xl leading-tight">
            Les mois écoulés
          </h1>
        </header>

        {rows.length === 0 ? (
          <p className="max-w-[48ch] text-ink-soft">
            Aucun mois enregistré pour l’instant.
            <br />
            Ouvrez le mois en cours depuis{" "}
            <Link to="/" className="text-ink underline underline-offset-4">
              la page d’accueil
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-rule">
            {rows.map((r, i) => (
              <li key={r.id} className={`rise rise-${Math.min(i + 1, 4)}`}>
                <Link
                  to={`/months/${formatYyyyMm(r.year, r.month)}`}
                  className="grid grid-cols-[1fr_auto_auto] items-baseline gap-6 py-5 transition-colors hover:bg-paper-sunken/40"
                >
                  <div>
                    <p className="font-heading text-xl text-ink">
                      {monthLabel(r.year, r.month)}
                    </p>
                    <p className="mt-1 text-sm text-ink-soft">
                      <MonthStatusBadge status={r.status} />
                    </p>
                  </div>
                  <p className="num text-right text-ink-soft">
                    <span className="eyebrow mr-3">total</span>
                    <span className="text-ink">{formatEuros(r.total)}</span>
                  </p>
                  <span aria-hidden className="text-ink-faint">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
