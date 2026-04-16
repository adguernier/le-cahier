import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/months";
import { requireAuth } from "~/lib/session.server";
import { getMonthState, listMonths } from "~/lib/queries.server";
import { formatYyyyMm, monthLabel } from "~/lib/month-utils";
import { formatEuros } from "~/lib/money";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

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
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Historique</h1>
      <Card>
        <CardContent className="pt-6">
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucun mois enregistré.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mois</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Total dépenses</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link
                        className="underline"
                        to={`/months/${formatYyyyMm(r.year, r.month)}`}
                      >
                        {monthLabel(r.year, r.month)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={r.status === "open" ? "default" : "outline"}
                      >
                        {r.status === "open" ? "Ouvert" : "Clos"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatEuros(r.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
