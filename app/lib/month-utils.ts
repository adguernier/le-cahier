const LABELS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

export function parseYyyyMm(input: string): { year: number; month: number } {
  const m = input.match(/^(\d{4})-(\d{2})$/);
  if (!m) throw new Error(`Invalid month format: ${input}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error(`Invalid month number: ${month}`);
  return { year, month };
}

export function formatYyyyMm(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function nextMonth(
  year: number,
  month: number
): { year: number; month: number } {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

export function prevMonth(
  year: number,
  month: number
): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

export function monthLabel(year: number, month: number): string {
  return `${LABELS[month - 1]} ${year}`;
}
