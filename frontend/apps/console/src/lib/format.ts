export function formatCurrency(value: number, locale: string, currency = "USD") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPreciseCurrency(value: number, locale: string, currency = "USD") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 5,
    maximumFractionDigits: 5,
  }).format(value);
}

export function formatNumber(value: number, locale: string, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatLatency(valueMs: number | null, locale: string) {
  if (valueMs === null || !Number.isFinite(valueMs) || valueMs < 0) return "—";
  if (valueMs === 0) return "< 1 s";
  if (valueMs < 1_000) return `${formatNumber(valueMs, locale)} ms`;
  return `${formatNumber(valueMs / 1_000, locale, { maximumFractionDigits: 1 })} s`;
}

export function formatDateTime(timestamp: number, locale: string, timeZone?: string) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(timestamp * 1000));
}

export function formatCompactDateTime(timestamp: number, locale: string, timeZone?: string) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(timestamp * 1000));
}

export function formatIdentifier(value: string, leading = 8, trailing = 4) {
  if (value.length <= leading + trailing + 1) return value;
  return `${value.slice(0, leading)}…${value.slice(-trailing)}`;
}
