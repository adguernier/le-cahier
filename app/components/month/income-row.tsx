import { useFetcher } from "react-router";
import type { MonthState } from "~/lib/queries.server";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

type Income = MonthState["incomes"][number];

export function IncomeRow({
  income,
  isClosed,
}: {
  income: Income;
  isClosed: boolean;
}) {
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state === "submitting";
  const error =
    fetcher.data && typeof fetcher.data === "object" && "error" in fetcher.data
      ? (fetcher.data as { error: string }).error
      : null;
  return (
    <li className="py-4">
      <fetcher.Form
        method="post"
        className="grid grid-cols-1 items-baseline gap-3 sm:grid-cols-[1fr_auto_auto_auto]"
      >
        <input type="hidden" name="intent" value="updateIncome" />
        <input type="hidden" name="memberId" value={income.memberId} />
        <p className="font-heading text-lg text-ink">{income.name}</p>
        <IncomeField
          name="amount"
          label="Revenu"
          defaultValue={income.amount}
          disabled={isClosed}
        />
        <IncomeField
          name="costOfLiving"
          label="Reste à vivre"
          defaultValue={income.costOfLiving}
          disabled={isClosed}
        />
        <div className="pt-2 sm:pt-0">
          {!isClosed && (
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={isSubmitting}
            >
              {isSubmitting ? "…" : "Enregistrer"}
            </Button>
          )}
        </div>
      </fetcher.Form>
      {error && (
        <p className="mt-2 text-sm text-danger" role="alert">
          <span aria-hidden className="mr-2">—</span>
          {error}
        </p>
      )}
    </li>
  );
}

function IncomeField({
  name,
  label,
  defaultValue,
  disabled,
}: {
  name: string;
  label: string;
  defaultValue: number;
  disabled: boolean;
}) {
  const id = `${name}-${defaultValue}`;
  return (
    <div className="flex flex-col gap-1 sm:w-32">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        defaultValue={(defaultValue / 100).toString()}
        disabled={disabled}
        inputMode="decimal"
        className="num text-right"
      />
    </div>
  );
}
