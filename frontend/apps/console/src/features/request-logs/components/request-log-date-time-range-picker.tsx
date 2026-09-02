import { useEffect, useMemo, useState } from "react";
import { CalendarDaysIcon, Globe2Icon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { enUS, zhCN } from "react-day-picker/locale";
import { useTranslation } from "react-i18next";

import { Button } from "@token-boat/ui/components/ui/button";
import { Calendar } from "@token-boat/ui/components/ui/calendar";
import { Input } from "@token-boat/ui/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@token-boat/ui/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@token-boat/ui/components/ui/select";
import { Separator } from "@token-boat/ui/components/ui/separator";
import { cn } from "@token-boat/ui/lib/utils";
import type { DateRangeValue } from "@/data/contracts";
import { localDateFromKey, localDateToKey } from "@/lib/date-range";
import {
  createRecentZonedDateRange,
  formatTimeZoneOffset,
  formatZonedDateTime,
  formatZonedDateTimeParts,
  isValidTimeZone,
  parseZonedDateTime,
  resolveBrowserTimeZone,
} from "@/lib/time-zone";

type RequestLogDateTimeRangePickerProps = {
  onChange: (value: DateRangeValue) => void;
  value: DateRangeValue;
};

type DateTimeDraft = {
  endDate: string;
  endTime: string;
  startDate: string;
  startTime: string;
};

const timeZoneStorageKey = "console-request-log-time-zone";
const commonTimeZones = [
  "UTC",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
] as const;
const quickRanges = [
  { label: "Last 5 minutes", seconds: 5 * 60 },
  { label: "Last 15 minutes", seconds: 15 * 60 },
  { label: "Last 30 minutes", seconds: 30 * 60 },
  { label: "Last 1 hour", seconds: 60 * 60 },
  { label: "Last 3 hours", seconds: 3 * 60 * 60 },
  { label: "Last 6 hours", seconds: 6 * 60 * 60 },
  { label: "Last 1 day", seconds: 24 * 60 * 60 },
  { label: "Last 3 days", seconds: 3 * 24 * 60 * 60 },
  { label: "Last 1 week", seconds: 7 * 24 * 60 * 60 },
] as const;

export function RequestLogDateTimeRangePicker(props: RequestLogDateTimeRangePickerProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const browserTimeZone = resolveBrowserTimeZone();
  const [timeZone, setTimeZone] = useState(() => {
    if (isValidTimeZone(props.value.timeZone)) return props.value.timeZone;
    const stored = window.localStorage.getItem(timeZoneStorageKey);
    return isValidTimeZone(stored ?? undefined) ? stored! : browserTimeZone;
  });
  const [draft, setDraft] = useState<DateTimeDraft>(() => draftFromValue(props.value, timeZone));

  useEffect(() => {
    const nextTimeZone = isValidTimeZone(props.value.timeZone) ? props.value.timeZone : timeZone;
    setTimeZone(nextTimeZone);
    setDraft(draftFromValue(props.value, nextTimeZone));
  }, [props.value, timeZone]);

  const locale = i18n.resolvedLanguage ?? "zh";
  const calendarLocale = locale.startsWith("en") ? enUS : zhCN;
  const timeZoneOptions = useMemo(
    () => [...new Set([browserTimeZone, ...commonTimeZones])],
    [browserTimeZone],
  );
  const timeZoneItems = useMemo(
    () => timeZoneOptions.map((zone) => ({ label: zone, value: zone })),
    [timeZoneOptions],
  );
  const startTimestamp = parseZonedDateTime(draft.startDate, draft.startTime, timeZone);
  const endTimestamp = parseZonedDateTime(draft.endDate, draft.endTime, timeZone);
  const validOrder =
    startTimestamp !== undefined && endTimestamp !== undefined && startTimestamp <= endTimestamp;
  const selectedRange: DateRange | undefined = draft.startDate
    ? {
        from: localDateFromKey(draft.startDate),
        to: draft.endDate ? localDateFromKey(draft.endDate) : undefined,
      }
    : undefined;
  const label = rangeLabel(props.value, locale, timeZone, t("Date range"));

  const applyQuickRange = (seconds: number) => {
    props.onChange(createRecentZonedDateRange(seconds, timeZone));
    setOpen(false);
  };

  const applyDraft = () => {
    if (!validOrder || startTimestamp === undefined || endTimestamp === undefined) return;
    props.onChange({
      preset: "custom",
      from: draft.startDate,
      to: draft.endDate,
      startTimestamp,
      endTimestamp,
      timeZone,
    });
    setOpen(false);
  };

  const changeTimeZone = (nextTimeZone: string | null) => {
    if (!nextTimeZone || !isValidTimeZone(nextTimeZone)) return;
    setTimeZone(nextTimeZone);
    setDraft(
      draftFromTimestamps(
        parseZonedDateTime(draft.startDate, draft.startTime, timeZone),
        parseZonedDateTime(draft.endDate, draft.endTime, timeZone),
        nextTimeZone,
      ),
    );
    window.localStorage.setItem(timeZoneStorageKey, nextTimeZone);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setDraft(draftFromValue(props.value, timeZone));
        setOpen(nextOpen);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            aria-label={t("Select date range")}
            className="max-w-full justify-start font-normal tabular-nums"
            variant="outline"
          />
        }
      >
        <CalendarDaysIcon data-icon="inline-start" />
        <span className="max-w-[min(70vw,34rem)] truncate">{label}</span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[calc(100svh-2rem)] w-[calc(100vw-2rem)] max-w-[44rem] overflow-y-auto p-0"
      >
        <div className="flex min-w-0 flex-col gap-3 p-3">
          <PopoverHeader className="gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <PopoverTitle>{t("Custom date and time range")}</PopoverTitle>
              <PopoverDescription className="sr-only">
                {t("Choose dates, enter times to the second, and confirm the display time zone.")}
              </PopoverDescription>
            </div>
            <Select items={timeZoneItems} onValueChange={changeTimeZone} value={timeZone}>
              <SelectTrigger aria-label={t("Time zone")} className="w-full sm:w-60">
                <Globe2Icon aria-hidden="true" />
                <SelectValue>
                  {timeZone === browserTimeZone
                    ? `${t("Browser time zone")} · ${timeZone}`
                    : timeZone}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectGroup>
                  {timeZoneOptions.map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      <span>{zone}</span>
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {formatTimeZoneOffset(Math.floor(Date.now() / 1_000), zone)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </PopoverHeader>

          <div className="grid min-w-0 gap-3 md:grid-cols-[8.5rem_minmax(0,1fr)]">
            <nav
              aria-label={t("Quick date ranges")}
              className="grid grid-cols-3 gap-1 rounded-lg bg-muted/50 p-1 md:grid-cols-1"
            >
              {quickRanges.map((range) => (
                <Button
                  className="h-8 justify-start px-2 text-xs font-normal"
                  key={range.label}
                  onClick={() => applyQuickRange(range.seconds)}
                  size="sm"
                  variant="ghost"
                >
                  {t(range.label)}
                </Button>
              ))}
            </nav>

            <div className="min-w-0 overflow-x-auto">
              <Calendar
                className="mx-auto p-0 [--cell-size:--spacing(8)]"
                defaultMonth={selectedRange?.from}
                locale={calendarLocale}
                mode="range"
                numberOfMonths={2}
                onSelect={(range) =>
                  setDraft((current) => ({
                    ...current,
                    startDate: range?.from ? localDateToKey(range.from) : "",
                    endDate: range?.to ? localDateToKey(range.to) : "",
                  }))
                }
                selected={selectedRange}
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <TimeField
              date={draft.startDate}
              onTimeChange={(value) => setDraft((current) => ({ ...current, startTime: value }))}
              time={draft.startTime}
              timeLabel={t("Start time")}
            />
            <TimeField
              date={draft.endDate}
              onTimeChange={(value) => setDraft((current) => ({ ...current, endTime: value }))}
              time={draft.endTime}
              timeLabel={t("End time")}
            />
          </div>

          <Separator />
          <div className="flex min-h-9 items-center justify-between gap-3">
            <p
              className={cn(
                "text-xs",
                startTimestamp !== undefined && endTimestamp !== undefined && !validOrder
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
              role={
                startTimestamp !== undefined && endTimestamp !== undefined && !validOrder
                  ? "alert"
                  : undefined
              }
            >
              {startTimestamp !== undefined && endTimestamp !== undefined && !validOrder
                ? t("Start time must be before end time")
                : t("Times use {{timeZone}} with second precision.", { timeZone })}
            </p>
            <Button disabled={!validOrder} onClick={applyDraft} size="sm">
              {t("Apply custom range")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TimeField(props: {
  date: string;
  onTimeChange: (value: string) => void;
  time: string;
  timeLabel: string;
}) {
  return (
    <label className="flex min-w-0 items-center gap-2 rounded-lg border p-2 text-xs text-muted-foreground">
      <span className="min-w-0 flex-1 truncate">
        {props.timeLabel} ·{" "}
        <span className="tabular-nums text-foreground">{props.date || "—"}</span>
      </span>
      <Input
        aria-label={props.timeLabel}
        className="h-8 w-32 shrink-0 tabular-nums"
        onChange={(event) => props.onTimeChange(event.target.value)}
        step={1}
        type="time"
        value={props.time}
      />
    </label>
  );
}

function draftFromValue(value: DateRangeValue, timeZone: string): DateTimeDraft {
  return draftFromTimestamps(value.startTimestamp, value.endTimestamp, timeZone, value);
}

function draftFromTimestamps(
  startTimestamp: number | undefined,
  endTimestamp: number | undefined,
  timeZone: string,
  fallback?: DateRangeValue,
): DateTimeDraft {
  const start = formatZonedDateTimeParts(startTimestamp, timeZone);
  const end = formatZonedDateTimeParts(endTimestamp, timeZone);
  return {
    startDate: start.date || fallback?.from || "",
    startTime: start.time || "00:00:00",
    endDate: end.date || fallback?.to || "",
    endTime: end.time || "23:59:59",
  };
}

function rangeLabel(
  value: DateRangeValue,
  locale: string,
  timeZone: string,
  fallback: string,
): string {
  if (value.startTimestamp === undefined || value.endTimestamp === undefined) return fallback;
  const start = formatZonedDateTime(value.startTimestamp, locale, timeZone);
  const end = formatZonedDateTime(value.endTimestamp, locale, timeZone);
  const offset = formatTimeZoneOffset(value.startTimestamp, timeZone);
  return `${start} – ${end} · ${offset}`;
}
