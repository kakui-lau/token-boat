import type { AdminTimeRange } from "@/repository/contracts";

export type { AdminTimeRange } from "@/repository/contracts";

export type AdminRecentTimeRangePreset = Exclude<AdminTimeRange["preset"], "custom">;

export type AdminZonedDateTimeOccurrence = "earlier" | "later";

export type AdminZonedDateTimeOccurrences = {
  endOccurrence?: AdminZonedDateTimeOccurrence;
  startOccurrence?: AdminZonedDateTimeOccurrence;
};

export const ADMIN_TIME_ZONE_OPTIONS = [
  { labelKey: "UTC", value: "UTC" },
  { labelKey: "Shanghai", value: "Asia/Shanghai" },
  { labelKey: "Tokyo", value: "Asia/Tokyo" },
  { labelKey: "Singapore", value: "Asia/Singapore" },
  { labelKey: "London", value: "Europe/London" },
  { labelKey: "New York", value: "America/New_York" },
  { labelKey: "Los Angeles", value: "America/Los_Angeles" },
] as const;

export const ADMIN_RECENT_TIME_RANGES: ReadonlyArray<{
  labelKey: string;
  preset: AdminRecentTimeRangePreset;
}> = [
  { labelKey: "Last 5 minutes", preset: "5m" },
  { labelKey: "Last 15 minutes", preset: "15m" },
  { labelKey: "Last 30 minutes", preset: "30m" },
  { labelKey: "Last 1 hour", preset: "1h" },
  { labelKey: "Last 3 hours", preset: "3h" },
  { labelKey: "Last 6 hours", preset: "6h" },
  { labelKey: "Last 1 day", preset: "24h" },
  { labelKey: "Last 3 days", preset: "3d" },
  { labelKey: "Last 1 week", preset: "7d" },
];

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

const recentRangeSeconds: Record<AdminRecentTimeRangePreset, number> = {
  "5m": 5 * 60,
  "15m": 15 * 60,
  "30m": 30 * 60,
  "1h": 60 * 60,
  "3h": 3 * 60 * 60,
  "6h": 6 * 60 * 60,
  "24h": 24 * 60 * 60,
  "3d": 3 * 24 * 60 * 60,
  "7d": 7 * 24 * 60 * 60,
};
const maxCustomRangeSeconds = 31 * 24 * 60 * 60;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

export function createDefaultAdminTimeRange(
  timeZone = resolveBrowserTimeZone(),
  referenceDate = new Date(),
): AdminTimeRange {
  return createRecentAdminTimeRange("1h", timeZone, referenceDate);
}

export function createRecentAdminTimeRange(
  preset: AdminRecentTimeRangePreset,
  timeZone = resolveBrowserTimeZone(),
  referenceDate = new Date(),
): AdminTimeRange {
  const resolvedTimeZone = isValidAdminTimeZone(timeZone) ? timeZone : "UTC";
  const endTimestamp = Math.floor(referenceDate.getTime() / 1_000);
  return {
    endTimestamp,
    preset,
    startTimestamp: endTimestamp - recentRangeSeconds[preset],
    timeZone: resolvedTimeZone,
  };
}

export function refreshAdminTimeRange(
  range: AdminTimeRange,
  referenceDate = new Date(),
): AdminTimeRange {
  return range.preset === "custom"
    ? range
    : createRecentAdminTimeRange(range.preset, range.timeZone, referenceDate);
}

export function createCustomAdminTimeRange(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
  timeZone: string,
  occurrences: AdminZonedDateTimeOccurrences = {},
): AdminTimeRange | null {
  const startTimestamp = parseAdminZonedDateTime(
    startDate,
    startTime,
    timeZone,
    occurrences.startOccurrence,
  );
  const endTimestamp = parseAdminZonedDateTime(
    endDate,
    endTime,
    timeZone,
    occurrences.endOccurrence,
  );
  if (
    startTimestamp === undefined ||
    endTimestamp === undefined ||
    startTimestamp > endTimestamp ||
    endTimestamp - startTimestamp > maxCustomRangeSeconds
  ) {
    return null;
  }
  return {
    endTimestamp,
    preset: "custom",
    startTimestamp,
    timeZone,
  };
}

export function changeAdminTimeRangeTimeZone(
  range: AdminTimeRange,
  timeZone: string,
): AdminTimeRange {
  if (!isValidAdminTimeZone(timeZone)) return range;
  return { ...range, timeZone };
}

export function resolveBrowserTimeZone(): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isValidAdminTimeZone(timeZone) ? timeZone : "UTC";
}

export function isValidAdminTimeZone(timeZone: string | undefined): timeZone is string {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function formatAdminZonedDateTimeParts(
  timestamp: number,
  timeZone: string,
): ZonedDateTimeParts {
  const parts = numericParts(timestamp * 1_000, timeZone);
  return {
    date: `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`,
    time: `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`,
  };
}

export function parseAdminZonedDateTime(
  dateValue: string,
  timeValue: string,
  timeZone: string,
  occurrence: AdminZonedDateTimeOccurrence = "earlier",
): number | undefined {
  const candidates = adminZonedDateTimeCandidates(dateValue, timeValue, timeZone);
  if (candidates.length === 0) return undefined;
  return occurrence === "later" ? candidates.at(-1) : candidates[0];
}

export function adminZonedDateTimeCandidates(
  dateValue: string,
  timeValue: string,
  timeZone: string,
): number[] {
  if (!isValidAdminTimeZone(timeZone)) return [];
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeValue);
  if (!dateMatch || !timeMatch) return [];

  const desired: NumericDateTimeParts = {
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    month: Number(dateMatch[2]),
    second: Number(timeMatch[3] ?? 0),
    year: Number(dateMatch[1]),
  };
  if (!validParts(desired)) return [];

  const desiredUtc = partsToUtc(desired);
  const possibleOffsets = new Set<number>();
  for (const hour of [-36, 0, 36]) {
    const sample = desiredUtc + hour * 60 * 60 * 1_000;
    possibleOffsets.add(partsToUtc(numericParts(sample, timeZone)) - sample);
  }

  const candidates = new Set<number>();
  for (const offset of possibleOffsets) {
    const candidate = desiredUtc - offset;
    if (partsToUtc(numericParts(candidate, timeZone)) === desiredUtc) {
      candidates.add(Math.floor(candidate / 1_000));
    }
  }
  return [...candidates].sort((left, right) => left - right);
}

export function formatAdminTimeZoneOffset(timestamp: number, timeZone: string): string {
  const instant = timestamp * 1_000;
  const parts = numericParts(instant, timeZone);
  const offsetMinutes = Math.round((partsToUtc(parts) - instant) / 60_000);
  if (offsetMinutes === 0) return "UTC";
  const sign = offsetMinutes > 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  return `UTC${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

export function formatAdminTimeZoneRangeOffset(
  startTimestamp: number,
  endTimestamp: number,
  timeZone: string,
): string {
  const startOffset = formatAdminTimeZoneOffset(startTimestamp, timeZone);
  const endOffset = formatAdminTimeZoneOffset(endTimestamp, timeZone);
  return startOffset === endOffset ? startOffset : `${startOffset} → ${endOffset}`;
}

export function calendarDateFromKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

export function calendarDateToKey(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const existing = formatterCache.get(timeZone);
  if (existing) return existing;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
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
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
    month: Number(values.get("month")),
    second: Number(values.get("second")),
    year: Number(values.get("year")),
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

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}
