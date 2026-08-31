import { useEffect, useId, useState } from "react";
import { CalendarClockIcon } from "lucide-react";
import { enUS, zhCN } from "react-day-picker/locale";
import { useTranslation } from "react-i18next";

import { Button } from "@token-boat/ui/components/ui/button";
import { Calendar } from "@token-boat/ui/components/ui/calendar";
import { Field, FieldDescription, FieldLabel } from "@token-boat/ui/components/ui/field";
import { Input } from "@token-boat/ui/components/ui/input";
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
import { formatDateTime } from "@/lib/format";

type ExpiryPreset = "keep" | "1" | "7" | "14" | "30" | "90" | "180" | "365" | "730" | "never";

const expiryPresets: ExpiryPreset[] = ["1", "7", "14", "30", "90", "180", "365", "730", "never"];
const expiryPresetsWithCurrent: ExpiryPreset[] = ["keep", ...expiryPresets];

type ExpiryDateTimePickerProps = {
  initialValue?: number | null;
  labelledBy: string;
  locale: string;
  onChange(value: number | null): void;
  showKeepCurrent?: boolean;
  value: number | null;
};

export function ExpiryDateTimePicker(props: ExpiryDateTimePickerProps) {
  const { t, i18n } = useTranslation();
  const timeInputId = useId();
  const [open, setOpen] = useState(false);
  const [draftDate, setDraftDate] = useState<Date | undefined>(() => expiryDraftDate(props.value));
  const [draftTime, setDraftTime] = useState(() => expiryDraftTime(props.value));

  useEffect(() => {
    setDraftDate(expiryDraftDate(props.value));
    setDraftTime(expiryDraftTime(props.value));
  }, [props.value]);

  const calendarLocale = i18n.resolvedLanguage === "en" ? enUS : zhCN;
  const customExpiresAt = draftDate ? localDateTimeToTimestamp(draftDate, draftTime) : null;
  const customExpiryValid = customExpiresAt !== null && customExpiresAt > Date.now() / 1000;
  const currentPreset =
    props.value === null
      ? "never"
      : props.showKeepCurrent && props.value === props.initialValue
        ? "keep"
        : undefined;
  const quickPresets = props.showKeepCurrent ? expiryPresetsWithCurrent : expiryPresets;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const calendarEndMonth = new Date(today);
  calendarEndMonth.setFullYear(calendarEndMonth.getFullYear() + 100);

  const selectPreset = (values: unknown[]) => {
    const preset = values[0] as ExpiryPreset | undefined;
    if (!preset) return;

    if (preset === "keep") props.onChange(props.initialValue ?? null);
    else if (preset === "never") props.onChange(null);
    else props.onChange(expiryFromNow(preset));
    setOpen(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraftDate(expiryDraftDate(props.value));
      setDraftTime(expiryDraftTime(props.value));
    }
    setOpen(nextOpen);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            aria-labelledby={props.labelledBy}
            className="w-full justify-start"
            variant="outline"
          />
        }
      >
        <CalendarClockIcon data-icon="inline-start" />
        <span className="min-w-0 truncate">
          {props.value === null ? t("Never expires") : formatDateTime(props.value, props.locale)}
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-2xl overflow-x-hidden overflow-y-auto p-0"
      >
        <div className="flex flex-col md:flex-row">
          <div className="flex flex-col gap-3 p-4 md:w-48 md:shrink-0">
            <p className="font-medium">{t("Quick expiration")}</p>
            <ToggleGroup
              aria-label={t("Quick expiration")}
              className="grid w-full grid-cols-2 md:hidden"
              onValueChange={selectPreset}
              size="sm"
              value={currentPreset ? [currentPreset] : []}
              variant="outline"
            >
              {quickPresets.map((preset) => (
                <ToggleGroupItem key={preset} value={preset}>
                  {t(expiryPresetLabel(preset))}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <ToggleGroup
              aria-label={t("Quick expiration")}
              className="hidden w-full flex-col items-stretch md:flex"
              onValueChange={selectPreset}
              orientation="vertical"
              value={currentPreset ? [currentPreset] : []}
            >
              {quickPresets.map((preset) => (
                <ToggleGroupItem className="w-full justify-start" key={preset} value={preset}>
                  {t(expiryPresetLabel(preset))}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <Separator className="h-px w-full md:hidden" />
          <Separator className="hidden w-px self-stretch md:block" orientation="vertical" />

          <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
            <PopoverHeader>
              <PopoverTitle>{t("Custom expiration")}</PopoverTitle>
              <PopoverDescription>
                {t("Choose a preset or set an exact expiration date and time.")}
              </PopoverDescription>
            </PopoverHeader>

            <Calendar
              captionLayout="dropdown"
              className="self-center p-0 [--cell-size:--spacing(9)] sm:[--cell-size:--spacing(10)]"
              defaultMonth={draftDate}
              disabled={{ before: today }}
              endMonth={calendarEndMonth}
              locale={calendarLocale}
              mode="single"
              onSelect={setDraftDate}
              selected={draftDate}
              startMonth={today}
            />

            <Field data-invalid={!customExpiryValid || undefined}>
              <FieldLabel htmlFor={timeInputId}>{t("Expiration time")}</FieldLabel>
              <Input
                aria-invalid={!customExpiryValid || undefined}
                id={timeInputId}
                onChange={(event) => setDraftTime(event.target.value)}
                step={60}
                type="time"
                value={draftTime}
              />
              {!customExpiryValid && (
                <FieldDescription>{t("Expiration must be in the future.")}</FieldDescription>
              )}
            </Field>

            <div className="flex justify-end">
              <Button
                disabled={!customExpiryValid}
                onClick={() => {
                  if (!customExpiryValid || customExpiresAt === null) return;
                  props.onChange(customExpiresAt);
                  setOpen(false);
                }}
              >
                {t("Apply expiration")}
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function expiryFromNow(preset: Exclude<ExpiryPreset, "keep" | "never">): number {
  const date = new Date();
  if (preset === "365" || preset === "730") {
    date.setFullYear(date.getFullYear() + (preset === "365" ? 1 : 2));
  } else date.setDate(date.getDate() + Number(preset));
  return Math.floor(date.getTime() / 1000);
}

function expiryDraftDate(timestamp: number | null): Date {
  if (timestamp) return new Date(timestamp * 1000);
  return new Date(expiryFromNow("30") * 1000);
}

function expiryDraftTime(timestamp: number | null): string {
  const date = expiryDraftDate(timestamp);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function localDateTimeToTimestamp(date: Date, time: string): number | null {
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  const value = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
  const timestamp = Math.floor(value.getTime() / 1000);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function expiryPresetLabel(preset: ExpiryPreset): string {
  if (preset === "keep") return "Keep current expiry";
  if (preset === "1") return "1 day from now";
  if (preset === "7") return "7 days from now";
  if (preset === "14") return "14 days from now";
  if (preset === "30") return "30 days from now";
  if (preset === "90") return "90 days from now";
  if (preset === "180") return "180 days from now";
  if (preset === "365") return "1 year from now";
  if (preset === "730") return "2 years from now";
  return "Never expires";
}
