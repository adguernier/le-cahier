import { Badge } from "~/components/ui/badge";

export function MonthStatusBadge({
  status,
}: {
  status: "draft" | "open" | "closed";
}) {
  if (status === "draft") {
    return <Badge variant="outline">Brouillon</Badge>;
  }
  return status === "open" ? (
    <Badge variant="accent">Mois ouvert</Badge>
  ) : (
    <Badge variant="outline">Mois clôturé</Badge>
  );
}
