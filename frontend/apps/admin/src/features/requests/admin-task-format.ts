export function formatUsd(value: number | null, locale: string): string {
  if (value === null) return "—";
  return new Intl.NumberFormat(locale, {
    currency: "USD",
    maximumFractionDigits: 6,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}
