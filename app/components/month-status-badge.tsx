import { Badge } from "~/components/ui/badge";

export function MonthStatusBadge({ status }: { status: "open" | "closed" }) {
  return status === "open" ? (
    <Badge variant="accent">Mois ouvert</Badge>
  ) : (
    <Badge variant="outline">Mois clôturé</Badge>
  );
}
