import { redirect } from "react-router";
import type { Route } from "./+types/home";
import { requireAuth } from "~/lib/session.server";
import { applyRollover, listMonths } from "~/lib/queries.server";
import { formatYyyyMm } from "~/lib/month-utils";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);

  const now = new Date();
  applyRollover(now);

  const all = listMonths();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const current = all.find((m) => m.year === year && m.month === month);
  const target = current ?? all[0];
  throw redirect(`/months/${formatYyyyMm(target.year, target.month)}`);
}

export default function Home() {
  return null;
}
