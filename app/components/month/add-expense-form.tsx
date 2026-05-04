import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import type { MonthState } from "~/lib/queries.server";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

type Category = { id: number; name: string };
type Income = MonthState["incomes"][number];

export function AddExpenseForm({
  categories,
  incomes,
}: {
  categories: Category[];
  incomes: Income[];
}) {
  const fetcher = useFetcher();
  const formRef = useRef<HTMLFormElement>(null);
  const isSubmitting = fetcher.state === "submitting";
  const data = fetcher.data as
    | { error: string }
    | { ok: true }
    | undefined;
  const submittedOk = fetcher.state === "idle" && data && !("error" in data);

  useEffect(() => {
    if (submittedOk) {
      formRef.current?.reset();
      formRef.current
        ?.querySelector<HTMLInputElement>('input[name="label"]')
        ?.focus();
    }
  }, [submittedOk]);

  return (
    <fetcher.Form
      ref={formRef}
      method="post"
      className="mt-8 grid grid-cols-1 gap-5 border-t border-rule pt-6 sm:grid-cols-[10rem_1fr_9rem_auto]"
      aria-labelledby="add-expense-title"
    >
      <p id="add-expense-title" className="eyebrow sm:col-span-4 -mb-2">
        Ajouter une dépense
      </p>
      <input type="hidden" name="intent" value="addExpense" />
      <div className="flex flex-col gap-1">
        <Label htmlFor="categoryId">Catégorie</Label>
        <select
          id="categoryId"
          name="categoryId"
          required
          className="border-0 border-b border-rule bg-transparent py-1.5 text-base text-ink outline-none focus:border-accent focus-visible:outline-none"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="expense-label">Libellé</Label>
        <Input
          id="expense-label"
          name="label"
          placeholder="Ex : électricité"
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="expense-amount">Montant (€)</Label>
        <Input
          id="expense-amount"
          name="amount"
          placeholder="0,00"
          required
          inputMode="decimal"
          className="num"
        />
      </div>
      <div className="flex items-end">
        <Button
          type="submit"
          variant="primary"
          className="w-full sm:w-auto"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Ajout…" : "Ajouter"}
        </Button>
      </div>
      <fieldset className="sm:col-span-4">
        <legend className="eyebrow mb-2">Concernés</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {incomes.map((i) => (
            <label
              key={i.memberId}
              className="inline-flex items-center gap-2 text-sm text-ink"
            >
              <input
                type="checkbox"
                name="memberIds"
                value={i.memberId}
                defaultChecked
                className="size-3.5 accent-ink"
              />
              {i.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="sm:col-span-4">
        <label className="inline-flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="recurring"
            value="on"
            className="size-3.5 accent-ink"
          />
          <span>
            Récurrente
            <span className="ml-2 text-xs text-ink-soft">
              (sera copiée dans le prévisionnel du mois suivant)
            </span>
          </span>
        </label>
      </div>
      {data && "error" in data && (
        <p className="sm:col-span-4 text-sm text-danger" role="alert">
          <span aria-hidden className="mr-2">—</span>
          {data.error}
        </p>
      )}
    </fetcher.Form>
  );
}
