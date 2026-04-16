import { Badge } from "~/components/ui/badge";

export function MonthStatusBadge({ status }: { status: "open" | "closed" }) {
  return (
    <Badge variant={status === "open" ? "default" : "outline"}>
      {status === "open" ? "Ouvert" : "Clos"}
    </Badge>
  );
}
