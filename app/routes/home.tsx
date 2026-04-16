import { redirect } from "react-router";
import type { Route } from "./+types/home";
import { requireAuth } from "~/lib/session.server";
import { createMonth, getMonth, listMonths } from "~/lib/queries.server";
import { formatYyyyMm } from "~/lib/month-utils";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  let current = getMonth(year, month);
  if (!current) {
    const existing = listMonths();
    if (existing.length === 0) {
      current = createMonth(year, month);
    } else {
      const [latest] = existing;
      throw redirect(`/months/${formatYyyyMm(latest.year, latest.month)}`);
    }
  }
  throw redirect(`/months/${formatYyyyMm(current.year, current.month)}`);
}

export default function Home() {
  return null;
}
