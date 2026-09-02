import type { DateRangePreset, DateRangeValue } from "@/data/contracts";

const dayInMilliseconds = 86_400_000;

export function localDateToKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function localDateFromKey(dateKey: string): Date {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(5, 7));
  const day = Number(dateKey.slice(8, 10));
  return new Date(year, month - 1, day);
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function createDateRange(
  preset: Exclude<DateRangePreset, "custom"> = "30d",
  referenceDate = new Date(),
): DateRangeValue {
  const to = startOfLocalDay(referenceDate);
  if (preset === "yesterday") {
    to.setDate(to.getDate() - 1);
    const dateKey = localDateToKey(to);
    return { preset, from: dateKey, to: dateKey };
  }

  const numberOfDays = preset === "today" ? 1 : Number.parseInt(preset, 10);
  const from = new Date(to);
  from.setDate(from.getDate() - (numberOfDays - 1));
  return { preset, from: localDateToKey(from), to: localDateToKey(to) };
}

export function createCustomDateRange(from: string, to: string): DateRangeValue | null {
  if (!from || !to || from > to) return null;
  return { preset: "custom", from, to };
}

export function dateRangeToUnix(range: DateRangeValue): { start: number; end: number } {
  if (
    range.startTimestamp !== undefined &&
    range.endTimestamp !== undefined &&
    range.startTimestamp <= range.endTimestamp
  ) {
    return { start: range.startTimestamp, end: range.endTimestamp };
  }
  const start = new Date(`${range.from}T00:00:00`).getTime();
  const end = new Date(`${range.to}T23:59:59.999`).getTime();
  return { start: Math.floor(start / 1000), end: Math.floor(end / 1000) };
}

export function dateRangeDayCount(range: DateRangeValue): number {
  if (
    range.startTimestamp !== undefined &&
    range.endTimestamp !== undefined &&
    range.startTimestamp <= range.endTimestamp
  ) {
    return Math.max(1, Math.ceil((range.endTimestamp - range.startTimestamp + 1) / 86_400));
  }
  const start = new Date(`${range.from}T00:00:00`).getTime();
  const end = new Date(`${range.to}T00:00:00`).getTime();
  return Math.max(1, Math.round((end - start) / dayInMilliseconds) + 1);
}

export function timestampMatchesDateRange(timestamp: number, range: DateRangeValue): boolean {
  const unixRange = dateRangeToUnix(range);
  return timestamp >= unixRange.start && timestamp <= unixRange.end;
}
