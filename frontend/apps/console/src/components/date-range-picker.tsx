import { useEffect, useState } from "react";
import { CalendarDaysIcon } from "lucide-react";
import { enUS, zhCN } from "react-day-picker/locale";
import { useTranslation } from "react-i18next";

import { Button } from "@token-boat/ui/components/ui/button";
import { Calendar } from "@token-boat/ui/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@token-boat/ui/components/ui/popover";
import { Separator } from "@token-boat/ui/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@token-boat/ui/components/ui/toggle-group";
import type { DateRangePreset, DateRangeValue } from "@/data/contracts";
import {
  createCustomDateRange,
  createDateRange,
  localDateFromKey,
  localDateToKey,
} from "@/lib/date-range";

type DateRangePickerProps = {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
};

const quickPresets: Array<Exclude<DateRangePreset, "custom">> = [
  "today",
  "yesterday",
  "3d",
  "7d",
  "14d",
  "30d",
  "90d",
  "180d",
  "365d",
];

export function DateRangePicker(props: DateRangePickerProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<{
    from: Date | undefined;
    to?: Date;
  }>(() => ({
    from: localDateFromKey(props.value.from),
    to: localDateFromKey(props.value.to),
  }));

  useEffect(() => {
    setDraftRange({
      from: localDateFromKey(props.value.from),
      to: localDateFromKey(props.value.to),
    });
  }, [props.value.from, props.value.to]);

  const formatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "zh", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  let label = `${formatter.format(new Date(`${props.value.from}T00:00:00`))} – ${formatter.format(
    new Date(`${props.value.to}T00:00:00`),
  )}`;
  if (props.value.preset === "today") label = t("Today");
  if (props.value.preset === "yesterday") label = t("Yesterday");
  const customRange =
    draftRange.from && draftRange.to
      ? createCustomDateRange(localDateToKey(draftRange.from), localDateToKey(draftRange.to))
      : null;
  const calendarLocale = i18n.resolvedLanguage === "en" ? enUS : zhCN;
  const draftLabel = customRange
    ? `${formatter.format(draftRange.from)} – ${formatter.format(draftRange.to)}`
    : t("Date range");
  const selectPreset = (values: unknown[]) => {
    const preset = values[0] as Exclude<DateRangePreset, "custom"> | undefined;
    if (!preset) return;
    props.onChange(createDateRange(preset));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button aria-label={t("Select date range")} variant="outline" />}>
        <CalendarDaysIcon data-icon="inline-start" />
        <span className="max-w-56 truncate">{label}</span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[calc(100svh-2rem)] w-[calc(100vw-2rem)] max-w-[52rem] overflow-y-auto p-0"
      >
        <div className="flex flex-col md:flex-row">
          <div className="flex flex-col gap-3 p-4 md:w-44 md:shrink-0">
            <p className="font-medium">{t("Date range")}</p>
            <ToggleGroup
              aria-label={t("Quick date ranges")}
              className="grid w-full grid-cols-2 md:hidden"
              onValueChange={selectPreset}
              size="sm"
              value={props.value.preset === "custom" ? [] : [props.value.preset]}
              variant="outline"
            >
              {quickPresets.map((preset) => (
                <ToggleGroupItem key={preset} value={preset}>
                  {t(quickPresetLabel(preset))}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <ToggleGroup
              aria-label={t("Quick date ranges")}
              className="hidden w-full flex-col items-stretch md:flex"
              onValueChange={selectPreset}
              orientation="vertical"
              value={props.value.preset === "custom" ? [] : [props.value.preset]}
            >
              {quickPresets.map((preset) => (
                <ToggleGroupItem className="w-full justify-start" key={preset} value={preset}>
                  {t(quickPresetLabel(preset))}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <Separator className="h-px w-full md:hidden" />
          <Separator className="hidden w-px self-stretch md:block" orientation="vertical" />

          <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
            <PopoverHeader className="gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div>
                <PopoverTitle>{t("Custom date range")}</PopoverTitle>
                <PopoverDescription className="sr-only">
                  {t("Choose a quick range or select custom dates on the calendar.")}
                </PopoverDescription>
              </div>
              <span className="text-right text-sm text-muted-foreground">{draftLabel}</span>
            </PopoverHeader>

            <Calendar
              className="self-center p-0 [--cell-size:--spacing(8)] sm:[--cell-size:--spacing(9)] lg:[--cell-size:--spacing(10)]"
              defaultMonth={draftRange.from}
              disabled={{ after: new Date() }}
              locale={calendarLocale}
              mode="range"
              numberOfMonths={2}
              onSelect={(range) => setDraftRange(range ?? { from: undefined })}
              selected={draftRange}
            />

            <div className="flex justify-end">
              <Button
                disabled={!customRange}
                onClick={() => {
                  if (!customRange) return;
                  props.onChange(customRange);
                  setOpen(false);
                }}
              >
                {t("Apply custom range")}
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function quickPresetLabel(preset: Exclude<DateRangePreset, "custom">): string {
  if (preset === "today") return "Today";
  if (preset === "yesterday") return "Yesterday";
  if (preset === "3d") return "Last 3 days";
  if (preset === "7d") return "Last 7 days";
  if (preset === "14d") return "Last 14 days";
  if (preset === "30d") return "Last 30 days";
  if (preset === "90d") return "Last 90 days";
  if (preset === "180d") return "Last 180 days";
  return "Last 365 days";
}
