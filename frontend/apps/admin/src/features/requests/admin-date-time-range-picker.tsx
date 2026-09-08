import { useEffect, useMemo, useState } from "react";
import { enUS, zhCN } from "date-fns/locale";
import { CalendarRangeIcon, Globe2Icon } from "lucide-react";
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
import {
  ADMIN_RECENT_TIME_RANGES,
  ADMIN_TIME_ZONE_OPTIONS,
  adminZonedDateTimeCandidates,
  calendarDateFromKey,
  calendarDateToKey,
  changeAdminTimeRangeTimeZone,
  createCustomAdminTimeRange,
  createRecentAdminTimeRange,
  formatAdminTimeZoneOffset,
  formatAdminTimeZoneRangeOffset,
  formatAdminZonedDateTimeParts,
  isValidAdminTimeZone,
  resolveBrowserTimeZone,
  type AdminRecentTimeRangePreset,
  type AdminTimeRange,
  type AdminZonedDateTimeOccurrence,
} from "./admin-time-range";

export type { AdminTimeRange } from "./admin-time-range";

type AdminDateTimeRangePickerProps = {
  onChange(value: AdminTimeRange): void;
  value: AdminTimeRange;
};

type DateTimeDraft = {
  endDate: string;
  endOccurrence: AdminZonedDateTimeOccurrence;
  endTime: string;
  startDate: string;
  startOccurrence: AdminZonedDateTimeOccurrence;
  startTime: string;
};

type CalendarRange = {
  from: Date | undefined;
  to?: Date;
};

const browserTimeZoneValue = "__browser_time_zone__";

export function AdminDateTimeRangePicker(props: AdminDateTimeRangePickerProps) {
  const { i18n, t } = useTranslation();
  const browserTimeZone = useMemo(resolveBrowserTimeZone, []);
  const initialTimeZone = normalizeTimeZone(props.value.timeZone, browserTimeZone);
  const [open, setOpen] = useState(false);
  const [timeZoneSelection, setTimeZoneSelection] = useState(() =>
    timeZoneSelectionFromValue(initialTimeZone, browserTimeZone),
  );
  const [draft, setDraft] = useState<DateTimeDraft>(() =>
    draftFromRange(props.value, initialTimeZone),
  );
  const [calendarMonth, setCalendarMonth] = useState(() =>
    calendarDateFromKey(draftFromRange(props.value, initialTimeZone).startDate),
  );

  useEffect(() => {
    const nextTimeZone = normalizeTimeZone(props.value.timeZone, browserTimeZone);
    const nextDraft = draftFromRange(props.value, nextTimeZone);
    setTimeZoneSelection(timeZoneSelectionFromValue(nextTimeZone, browserTimeZone));
    setDraft(nextDraft);
    setCalendarMonth(calendarDateFromKey(nextDraft.startDate));
  }, [browserTimeZone, props.value.endTimestamp, props.value.startTimestamp, props.value.timeZone]);

  const displayTimeZone = normalizeTimeZone(props.value.timeZone, browserTimeZone);
  const selectedTimeZone = resolvedTimeZone(timeZoneSelection, browserTimeZone);
  const calendarLocale = i18n.resolvedLanguage?.startsWith("zh") ? zhCN : enUS;
  const selectedRange: CalendarRange = {
    from: draft.startDate ? calendarDateFromKey(draft.startDate) : undefined,
    to: draft.endDate ? calendarDateFromKey(draft.endDate) : undefined,
  };
  const customRange = createCustomAdminTimeRange(
    draft.startDate,
    draft.startTime,
    draft.endDate,
    draft.endTime,
    selectedTimeZone,
    {
      endOccurrence: draft.endOccurrence,
      startOccurrence: draft.startOccurrence,
    },
  );
  const startCandidates = adminZonedDateTimeCandidates(
    draft.startDate,
    draft.startTime,
    selectedTimeZone,
  );
  const endCandidates = adminZonedDateTimeCandidates(
    draft.endDate,
    draft.endTime,
    selectedTimeZone,
  );
  const currentRangeLabel = rangeLabel(
    props.value,
    i18n.resolvedLanguage ?? "en",
    displayTimeZone,
    t,
  );
  const timeZoneItems = useMemo(
    () => [
      { label: `${t("Browser time zone")} · ${browserTimeZone}`, value: browserTimeZoneValue },
      ...ADMIN_TIME_ZONE_OPTIONS.map((option) => ({
        label: `${t(option.labelKey)} · ${option.value}`,
        value: option.value,
      })),
    ],
    [browserTimeZone, t],
  );

  const applyRecentRange = (preset: AdminRecentTimeRangePreset) => {
    props.onChange(
      createRecentAdminTimeRange(preset, resolvedTimeZone(timeZoneSelection, browserTimeZone)),
    );
    setOpen(false);
  };

  const applyCustomRange = () => {
    if (!customRange) return;
    props.onChange(customRange);
    setOpen(false);
  };

  const changeTimeZone = (nextSelection: string | null) => {
    if (!nextSelection) return;
    const nextTimeZone = resolvedTimeZone(nextSelection, browserTimeZone);
    if (!isValidAdminTimeZone(nextTimeZone)) return;

    const currentTimeZone = resolvedTimeZone(timeZoneSelection, browserTimeZone);
    const appliedDraft = draftFromRange(props.value, currentTimeZone);
    const currentRange = draftsMatch(draft, appliedDraft)
      ? props.value
      : (createCustomAdminTimeRange(
          draft.startDate,
          draft.startTime,
          draft.endDate,
          draft.endTime,
          currentTimeZone,
          {
            endOccurrence: draft.endOccurrence,
            startOccurrence: draft.startOccurrence,
          },
        ) ?? props.value);
    const nextRange = changeAdminTimeRangeTimeZone(currentRange, nextTimeZone);
    const nextDraft = draftFromRange(nextRange, nextTimeZone);
    setTimeZoneSelection(nextSelection);
    setDraft(nextDraft);
    setCalendarMonth(calendarDateFromKey(nextDraft.startDate));
    props.onChange(nextRange);
  };

  return (
    <Popover
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          const nextDraft = draftFromRange(props.value, displayTimeZone);
          setDraft(nextDraft);
          setCalendarMonth(calendarDateFromKey(nextDraft.startDate));
        }
        setOpen(nextOpen);
      }}
      open={open}
    >
      <PopoverTrigger
        render={
          <Button
            aria-label={`${t("Select date and time range")}: ${currentRangeLabel}`}
            className="max-w-full justify-start font-normal tabular-nums"
            size="sm"
            variant="outline"
          />
        }
      >
        <CalendarRangeIcon data-icon="inline-start" />
        <span className="max-w-[min(70vw,28rem)] truncate">{currentRangeLabel}</span>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="max-h-[calc(100svh-1rem)] w-[calc(100vw-1rem)] max-w-[40rem] overflow-y-auto p-0"
      >
        <div className="flex min-w-0 flex-col gap-3 p-3">
          <PopoverHeader className="gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <PopoverTitle>{t("Date and time range")}</PopoverTitle>
              <PopoverDescription className="sr-only">
                {t("Choose a range with second precision and a display time zone.")}
              </PopoverDescription>
            </div>

            <Select items={timeZoneItems} onValueChange={changeTimeZone} value={timeZoneSelection}>
              <SelectTrigger aria-label={t("Time zone")} className="w-full sm:w-64">
                <Globe2Icon aria-hidden="true" />
                <SelectValue>
                  {timeZoneSelection === browserTimeZoneValue
                    ? `${t("Browser")} · ${browserTimeZone}`
                    : timeZoneLabel(timeZoneSelection, t)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} side="bottom">
                <SelectGroup>
                  <SelectItem value={browserTimeZoneValue}>
                    <TimeZoneOption
                      label={t("Browser time zone")}
                      offset={formatAdminTimeZoneRangeOffset(
                        props.value.startTimestamp,
                        props.value.endTimestamp,
                        browserTimeZone,
                      )}
                      timeZone={browserTimeZone}
                    />
                  </SelectItem>
                  {ADMIN_TIME_ZONE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <TimeZoneOption
                        label={t(option.labelKey)}
                        offset={formatAdminTimeZoneRangeOffset(
                          props.value.startTimestamp,
                          props.value.endTimestamp,
                          option.value,
                        )}
                        timeZone={option.value}
                      />
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </PopoverHeader>

          <div
            aria-label={t("Quick ranges")}
            className="grid grid-cols-3 gap-1 rounded-lg bg-muted/50 p-1 sm:grid-cols-5"
            role="group"
          >
            {ADMIN_RECENT_TIME_RANGES.map((range) => (
              <Button
                aria-pressed={props.value.preset === range.preset}
                className="h-8 px-2 text-xs font-normal"
                key={range.preset}
                onClick={() => applyRecentRange(range.preset)}
                size="sm"
                variant={props.value.preset === range.preset ? "secondary" : "ghost"}
              >
                {t(range.labelKey)}
              </Button>
            ))}
          </div>

          <div className="grid min-w-0 items-start gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
            <div className="min-w-0 overflow-x-auto">
              <Calendar
                className="mx-auto p-0 [--cell-size:--spacing(7)]"
                locale={calendarLocale}
                mode="range"
                month={calendarMonth}
                numberOfMonths={1}
                onMonthChange={setCalendarMonth}
                onSelect={(range: CalendarRange | undefined) =>
                  setDraft((current) => ({
                    ...current,
                    endDate: range?.to ? calendarDateToKey(range.to) : "",
                    endOccurrence: "earlier",
                    startDate: range?.from ? calendarDateToKey(range.from) : "",
                    startOccurrence: "earlier",
                  }))
                }
                selected={selectedRange}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-2">
              <TimeField
                date={draft.startDate}
                label={t("Start")}
                occurrence={draft.startOccurrence}
                occurrenceCandidates={startCandidates}
                onOccurrenceChange={(startOccurrence) =>
                  setDraft((current) => ({ ...current, startOccurrence }))
                }
                onTimeChange={(startTime) =>
                  setDraft((current) => ({ ...current, startOccurrence: "earlier", startTime }))
                }
                time={draft.startTime}
                timeLabel={t("Start time")}
                timeZone={selectedTimeZone}
              />
              <TimeField
                date={draft.endDate}
                label={t("End")}
                occurrence={draft.endOccurrence}
                occurrenceCandidates={endCandidates}
                onOccurrenceChange={(endOccurrence) =>
                  setDraft((current) => ({ ...current, endOccurrence }))
                }
                onTimeChange={(endTime) =>
                  setDraft((current) => ({ ...current, endOccurrence: "earlier", endTime }))
                }
                time={draft.endTime}
                timeLabel={t("End time")}
                timeZone={selectedTimeZone}
              />
              <p
                className={cn(
                  "px-1 text-xs leading-5",
                  customRange ? "text-muted-foreground" : "text-destructive",
                )}
                role={customRange ? undefined : "alert"}
              >
                {customRange
                  ? t("Times are interpreted in {{timeZone}}.", {
                      timeZone: resolvedTimeZone(timeZoneSelection, browserTimeZone),
                    })
                  : t(
                      "Enter a valid range no longer than 31 days, with the start no later than the end.",
                    )}
              </p>
            </div>
          </div>

          <Separator />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {t("Start and end times support second precision.")}
            </p>
            <Button disabled={!customRange} onClick={applyCustomRange} size="sm">
              {t("Apply range")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TimeField(props: {
  date: string;
  label: string;
  occurrence: AdminZonedDateTimeOccurrence;
  occurrenceCandidates: number[];
  onOccurrenceChange(value: AdminZonedDateTimeOccurrence): void;
  onTimeChange(value: string): void;
  time: string;
  timeLabel: string;
  timeZone: string;
}) {
  const { t } = useTranslation();
  const occurrenceItems = props.occurrenceCandidates.map((timestamp, index) => ({
    label: `${formatAdminTimeZoneOffset(timestamp, props.timeZone)} · ${t(
      index === 0 ? "First occurrence" : "Second occurrence",
    )}`,
    value: index === 0 ? "earlier" : "later",
  }));

  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border p-2 text-xs text-muted-foreground">
      <span className="flex items-center justify-between gap-2">
        <span>{props.label}</span>
        <span className="truncate font-mono text-foreground">{props.date || "—"}</span>
      </span>
      <Input
        aria-label={props.timeLabel}
        className="h-8 w-full tabular-nums"
        onChange={(event) => props.onTimeChange(event.target.value)}
        step={1}
        type="time"
        value={props.time}
      />
      {occurrenceItems.length > 1 ? (
        <Select
          items={occurrenceItems}
          onValueChange={(value) => {
            if (value === "earlier" || value === "later") props.onOccurrenceChange(value);
          }}
          value={props.occurrence}
        >
          <SelectTrigger
            aria-label={`${props.label}: ${t("Repeated local time")}`}
            className="h-8 w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {occurrenceItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}

function TimeZoneOption(props: { label: string; offset: string; timeZone: string }) {
  return (
    <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block truncate">{props.label}</span>
        <span className="block truncate text-xs text-muted-foreground">{props.timeZone}</span>
      </span>
      <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
        {props.offset}
      </span>
    </span>
  );
}

function draftFromRange(range: AdminTimeRange, timeZone: string): DateTimeDraft {
  const start = formatAdminZonedDateTimeParts(range.startTimestamp, timeZone);
  const end = formatAdminZonedDateTimeParts(range.endTimestamp, timeZone);
  const startCandidates = adminZonedDateTimeCandidates(start.date, start.time, timeZone);
  const endCandidates = adminZonedDateTimeCandidates(end.date, end.time, timeZone);
  return {
    endDate: end.date,
    endOccurrence:
      endCandidates.length > 1 && endCandidates.at(-1) === range.endTimestamp ? "later" : "earlier",
    endTime: end.time,
    startDate: start.date,
    startOccurrence:
      startCandidates.length > 1 && startCandidates.at(-1) === range.startTimestamp
        ? "later"
        : "earlier",
    startTime: start.time,
  };
}

function draftsMatch(left: DateTimeDraft, right: DateTimeDraft): boolean {
  return (
    left.startDate === right.startDate &&
    left.startTime === right.startTime &&
    left.startOccurrence === right.startOccurrence &&
    left.endDate === right.endDate &&
    left.endTime === right.endTime &&
    left.endOccurrence === right.endOccurrence
  );
}

function normalizeTimeZone(timeZone: string, browserTimeZone: string): string {
  return isValidAdminTimeZone(timeZone) ? timeZone : browserTimeZone;
}

function resolvedTimeZone(selection: string, browserTimeZone: string): string {
  return selection === browserTimeZoneValue ? browserTimeZone : selection;
}

function timeZoneSelectionFromValue(timeZone: string, browserTimeZone: string): string {
  return timeZone === browserTimeZone ? browserTimeZoneValue : timeZone;
}

function timeZoneLabel(timeZone: string, t: (key: string) => string): string {
  const option = ADMIN_TIME_ZONE_OPTIONS.find((candidate) => candidate.value === timeZone);
  return option ? t(option.labelKey) : timeZone;
}

function rangeLabel(
  range: AdminTimeRange,
  locale: string,
  timeZone: string,
  t: (key: string) => string,
): string {
  const preset = ADMIN_RECENT_TIME_RANGES.find((candidate) => candidate.preset === range.preset);
  const offset = formatAdminTimeZoneRangeOffset(range.startTimestamp, range.endTimestamp, timeZone);
  if (preset) return `${t(preset.labelKey)} · ${offset}`;

  const formatter = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  });
  return `${formatter.format(new Date(range.startTimestamp * 1_000))} – ${formatter.format(
    new Date(range.endTimestamp * 1_000),
  )} · ${offset}`;
}
