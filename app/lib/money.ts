const formatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

export function eurosToCents(input: string): number {
  const normalized = input.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`Invalid monetary input: ${input}`);
  }
  const euros = Number(normalized);
  return Math.round(euros * 100);
}

export function centsToEuros(cents: number): number {
  return cents / 100;
}

export function formatEuros(cents: number): string {
  return formatter.format(centsToEuros(cents));
}
