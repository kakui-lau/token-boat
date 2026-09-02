import type { DateRangePreset, DateRangeValue } from "@/data/contracts";

type ZonedDateTimeParts = {
  date: string;
  time: string;
};

type NumericDateTimeParts = {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  year: number;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

export function resolveBrowserTimeZone(): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isValidTimeZone(timeZone) ? timeZone : "UTC";
}

export function isValidTimeZone(timeZone: string | undefined): timeZone is string {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function formatZonedDateTimeParts(
  timestamp: number | undefined,
  timeZone: string,
): ZonedDateTimeParts {
  if (timestamp === undefined) return { date: "", time: "" };
  const parts = numericParts(timestamp * 1_000, timeZone);
  return {
    date: `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`,
    time: `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`,
  };
}

export function parseZonedDateTime(
  dateValue: string,
  timeValue: string,
  timeZone: string,
): number | undefined {
  if (!isValidTimeZone(timeZone)) return undefined;
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeValue);
  if (!dateMatch || !timeMatch) return undefined;

  const desired: NumericDateTimeParts = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    second: Number(timeMatch[3] ?? 0),
  };
  if (!validParts(desired)) return undefined;

  const desiredUtc = partsToUtc(desired);
  let guess = desiredUtc;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const rendered = numericParts(guess, timeZone);
    const adjustment = desiredUtc - partsToUtc(rendered);
    guess += adjustment;
    if (adjustment === 0) break;
  }

  const rendered = numericParts(guess, timeZone);
  if (partsToUtc(rendered) !== desiredUtc) return undefined;
  return Math.floor(guess / 1_000);
}

export function formatZonedDateTime(timestamp: number, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(timestamp * 1_000));
}

export function formatTimeZoneOffset(timestamp: number, timeZone: string): string {
  const offset = timeZoneOffsetMinutesAt(timestamp, timeZone);
  if (offset === 0) return "UTC";
  const sign = offset >= 0 ? "+" : "-";
  const absolute = Math.abs(offset);
  return `UTC${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

export function timeZoneOffsetMinutesAt(timestamp: number, timeZone: string): number {
  if (!isValidTimeZone(timeZone)) return -new Date(timestamp * 1_000).getTimezoneOffset();
  const instant = timestamp * 1_000;
  const parts = numericParts(instant, timeZone);
  return Math.round((partsToUtc(parts) - instant) / 60_000);
}

export function createZonedDateRange(
  preset: Exclude<DateRangePreset, "custom">,
  timeZone: string,
  referenceDate = new Date(),
): DateRangeValue {
  const today = formatZonedDateTimeParts(
    Math.floor(referenceDate.getTime() / 1_000),
    timeZone,
  ).date;
  let to = today;
  if (preset === "yesterday") to = shiftDateKey(today, -1);
  const days = preset === "today" || preset === "yesterday" ? 1 : Number.parseInt(preset, 10);
  const from = shiftDateKey(to, -(days - 1));
  return withExactTimeRange({ from, preset, to }, "00:00:00", "23:59:59", timeZone);
}

export function createRecentZonedDateRange(
  seconds: number,
  timeZone: string,
  referenceDate = new Date(),
): DateRangeValue {
  const endTimestamp = Math.floor(referenceDate.getTime() / 1_000);
  const startTimestamp = endTimestamp - seconds;
  return {
    preset: "custom",
    from: formatZonedDateTimeParts(startTimestamp, timeZone).date,
    to: formatZonedDateTimeParts(endTimestamp, timeZone).date,
    startTimestamp,
    endTimestamp,
    timeZone,
  };
}

export function withExactTimeRange(
  range: DateRangeValue,
  startTime: string,
  endTime: string,
  timeZone: string,
): DateRangeValue {
  const startTimestamp = parseZonedDateTime(range.from, startTime, timeZone);
  const endTimestamp = parseZonedDateTime(range.to, endTime, timeZone);
  if (startTimestamp === undefined || endTimestamp === undefined) return range;
  return { ...range, endTimestamp, startTimestamp, timeZone };
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const existing = formatterCache.get(timeZone);
  if (existing) return existing;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone,
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

function numericParts(timestampMilliseconds: number, timeZone: string): NumericDateTimeParts {
  const values = new Map(
    formatterFor(timeZone)
      .formatToParts(new Date(timestampMilliseconds))
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
    second: Number(values.get("second")),
  };
}

function partsToUtc(parts: NumericDateTimeParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function validParts(parts: NumericDateTimeParts): boolean {
  if (parts.year < 1970 || parts.year > 9999) return false;
  if (parts.month < 1 || parts.month > 12) return false;
  if (parts.day < 1 || parts.day > 31) return false;
  if (parts.hour < 0 || parts.hour > 23) return false;
  if (parts.minute < 0 || parts.minute > 59) return false;
  if (parts.second < 0 || parts.second > 59) return false;
  const normalized = new Date(partsToUtc(parts));
  return (
    normalized.getUTCFullYear() === parts.year &&
    normalized.getUTCMonth() + 1 === parts.month &&
    normalized.getUTCDate() === parts.day
  );
}

function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + days, 12));
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}
