export function formatAdminDateTime(
  timestamp: number | null,
  locale: string,
  timeZone: string,
): string {
  if (!timestamp || timestamp <= 0) return "—";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone,
  }).format(new Date(timestamp * 1_000));
}

export function formatAdminCurrency(value: number | null, locale: string): string {
  if (value === null) return "—";
  return new Intl.NumberFormat(locale, {
    currency: "USD",
    maximumFractionDigits: value > 0 && value < 0.01 ? 6 : 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

export function formatAdminNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

export function formatAdminLatency(value: number | null, locale: string): string {
  if (value === null) return "—";
  if (value < 1_000) return `${formatAdminNumber(value, locale)} ms`;
  return `${formatAdminNumber(value / 1_000, locale)} s`;
}
