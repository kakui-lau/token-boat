import { useState } from "react";

import type {
  AccountActivityListInput,
  ApiKeyListInput,
  BillingLedgerListInput,
  BillingTransactionListInput,
  DateRangePreset,
  DateRangeValue,
  ModelCatalogItem,
  RequestLogListInput,
  SortOrder,
  TaskListInput,
} from "@/data/contracts";
import {
  createCustomDateRange,
  createDateRange,
  localDateFromKey,
  localDateToKey,
} from "./date-range";
import {
  createZonedDateRange,
  formatZonedDateTimeParts,
  isValidTimeZone,
  resolveBrowserTimeZone,
  withExactTimeRange,
} from "./time-zone";

type PaginationSearch = {
  order?: SortOrder;
  page?: number;
  pageSize?: number;
};

export type DateRangeSearch = {
  from?: string;
  range?: DateRangePreset;
  to?: string;
};

export type ApiKeySearch = PaginationSearch & {
  detail?: number;
  q?: string;
  status?: ApiKeyListInput["status"];
};

export type RequestLogSearch = DateRangeSearch &
  PaginationSearch & {
    detail?: string;
    detailTab?: "overview" | "usage" | "diagnostics";
    end?: number;
    field?: RequestLogListInput["searchField"];
    q?: string;
    start?: number;
    status?: Exclude<RequestLogListInput["status"], "processing">;
    tz?: string;
  };

export type AccountActivitySearch = DateRangeSearch &
  PaginationSearch & {
    detail?: string;
    type?: AccountActivityListInput["type"];
  };

export type TaskSearch = DateRangeSearch &
  PaginationSearch & {
    detail?: string;
    status?: TaskListInput["status"];
    type?: TaskListInput["type"];
  };

export type BillingSearch = DateRangeSearch &
  PaginationSearch & {
    detail?: string;
    ledgerDetail?: string;
    ledgerOrder?: SortOrder;
    ledgerPage?: number;
    ledgerPageSize?: number;
    ledgerType?: BillingLedgerListInput["type"];
    q?: string;
    status?: BillingTransactionListInput["status"];
    tab?: "history" | "ledger" | "plans";
    type?: BillingTransactionListInput["type"];
  };

export type UsageSearch = DateRangeSearch;

export type OverviewSearch = DateRangeSearch;

export type ModelSortKey =
  | "capabilities"
  | "context"
  | "inputPrice"
  | "model"
  | "outputPrice"
  | "status"
  | "type";

export type ModelSearch = {
  availability?: "all" | "available";
  detail?: string;
  family?: ModelCatalogItem["family"];
  order?: SortOrder;
  q?: string;
  sort?: ModelSortKey;
};

export type PlaygroundSearch = {
  model?: string;
};

export type SearchPatch<T extends object> = Partial<{ [Key in keyof T]: T[Key] | undefined }>;

export function searchPatchShouldResetScroll<T extends object>(
  patch: SearchPatch<T>,
  overlayKeys: readonly (keyof T)[],
): boolean {
  const changedKeys = Object.keys(patch) as (keyof T)[];
  return changedKeys.length === 0 || changedKeys.some((key) => !overlayKeys.includes(key));
}

export function useControllableSearch<T extends object>(
  value: T | undefined,
  onChange: ((patch: SearchPatch<T>) => void) | undefined,
): [T, (patch: SearchPatch<T>) => void] {
  const [localValue, setLocalValue] = useState<T>(() => value ?? ({} as T));
  const currentValue = value ?? localValue;
  const update = (patch: SearchPatch<T>) => {
    if (onChange) {
      onChange(patch);
      return;
    }
    setLocalValue((previous) => ({ ...previous, ...patch }));
  };
  return [currentValue, update];
}

export function parseApiKeySearch(search: Record<string, unknown>): ApiKeySearch {
  return {
    detail: parsePositiveInteger(search.detail),
    order: parseEnum(search.order, ["asc", "desc"]),
    page: parsePositiveInteger(search.page),
    pageSize: parsePageSize(search.pageSize),
    q: parseKeyword(search.q),
    status: parseEnum(search.status, ["all", "active", "disabled", "expired", "exhausted"]),
  };
}

export function parseRequestLogSearch(search: Record<string, unknown>): RequestLogSearch {
  const detail = parseKeyword(search.detail);
  const start = parseUnixTimestamp(search.start);
  const end = parseUnixTimestamp(search.end);
  const exactRangeValid = start !== undefined && end !== undefined && start <= end;
  return {
    ...parseDateRangeSearch(search),
    detail,
    detailTab: detail
      ? parseEnum(search.detailTab, ["overview", "usage", "diagnostics"])
      : undefined,
    field: parseEnum(search.field, ["request", "service_trace", "model", "api_key"]),
    end: exactRangeValid ? end : undefined,
    order: parseEnum(search.order, ["asc", "desc"]),
    page: parsePositiveInteger(search.page),
    pageSize: parsePageSize(search.pageSize),
    q: parseKeyword(search.q),
    start: exactRangeValid ? start : undefined,
    status: parseEnum(search.status, ["all", "succeeded", "failed"]),
    tz: exactRangeValid ? parseTimeZone(search.tz) : undefined,
  };
}

export function parseAccountActivitySearch(search: Record<string, unknown>): AccountActivitySearch {
  return {
    ...parseDateRangeSearch(search),
    detail: parseKeyword(search.detail),
    order: parseEnum(search.order, ["asc", "desc"]),
    page: parsePositiveInteger(search.page),
    pageSize: parsePageSize(search.pageSize),
    type: parseEnum(search.type, ["all", "management", "system", "login"]),
  };
}

export function parseTaskSearch(search: Record<string, unknown>): TaskSearch {
  return {
    ...parseDateRangeSearch(search),
    detail: parseKeyword(search.detail),
    order: parseEnum(search.order, ["asc", "desc"]),
    page: parsePositiveInteger(search.page),
    pageSize: parsePageSize(search.pageSize, [12, 24, 48]),
    status: parseEnum(search.status, [
      "all",
      "queued",
      "processing",
      "succeeded",
      "failed",
      "cancelled",
      "expired",
    ]),
    type: parseEnum(search.type, ["all", "image", "video", "audio"]),
  };
}

export function parseBillingSearch(search: Record<string, unknown>): BillingSearch {
  const tab = parseEnum(search.tab, ["history", "ledger", "plans"]);
  return {
    ...parseDateRangeSearch(search),
    detail: tab === undefined || tab === "history" ? parseKeyword(search.detail) : undefined,
    ledgerDetail: tab === "ledger" ? parseKeyword(search.ledgerDetail) : undefined,
    ledgerOrder: parseEnum(search.ledgerOrder, ["asc", "desc"]),
    ledgerPage: parsePositiveInteger(search.ledgerPage),
    ledgerPageSize: parsePageSize(search.ledgerPageSize),
    ledgerType: parseEnum(search.ledgerType, ["all", "topup", "refund"]),
    order: parseEnum(search.order, ["asc", "desc"]),
    page: parsePositiveInteger(search.page),
    pageSize: parsePageSize(search.pageSize),
    q: parseKeyword(search.q),
    status: parseEnum(search.status, ["all", "completed", "pending", "failed"]),
    tab,
    type: parseEnum(search.type, ["all", "topup", "subscription"]),
  };
}

export function parseUsageSearch(search: Record<string, unknown>): UsageSearch {
  return parseDateRangeSearch(search);
}

export function parseOverviewSearch(search: Record<string, unknown>): OverviewSearch {
  return parseDateRangeSearch(search);
}

export function parseModelSearch(search: Record<string, unknown>): ModelSearch {
  return {
    availability: parseEnum(search.availability, ["all", "available"]),
    detail: parseKeyword(search.detail),
    family: parseEnum(search.family, [
      "chat",
      "reasoning",
      "embedding",
      "image",
      "audio",
      "video",
      "unknown",
    ]),
    order: parseEnum(search.order, ["asc", "desc"]),
    q: parseKeyword(search.q),
    sort: parseEnum(search.sort, [
      "capabilities",
      "context",
      "inputPrice",
      "model",
      "outputPrice",
      "status",
      "type",
    ]),
  };
}

export function parsePlaygroundSearch(search: Record<string, unknown>): PlaygroundSearch {
  return { model: parseKeyword(search.model) };
}

export function resolveDateRange(
  search: DateRangeSearch,
  fallback: Exclude<DateRangePreset, "custom">,
  referenceDate = new Date(),
): DateRangeValue {
  if (search.range === "custom" && search.from && search.to) {
    const customRange = createCustomDateRange(search.from, search.to);
    if (customRange) return customRange;
  }
  if (search.range && search.range !== "custom") {
    return createDateRange(search.range, referenceDate);
  }
  return createDateRange(fallback, referenceDate);
}

export function dateRangeSearchPatch(
  range: DateRangeValue,
  fallback: Exclude<DateRangePreset, "custom">,
): SearchPatch<DateRangeSearch> {
  if (range.preset === "custom") {
    return { from: range.from, range: "custom", to: range.to };
  }
  return {
    from: undefined,
    range: range.preset === fallback ? undefined : range.preset,
    to: undefined,
  };
}

export function resolveRequestLogRange(
  search: RequestLogSearch,
  fallback: Exclude<DateRangePreset, "custom">,
  referenceDate = new Date(),
): DateRangeValue {
  const timeZone = isValidTimeZone(search.tz) ? search.tz : resolveBrowserTimeZone();
  if (search.start !== undefined && search.end !== undefined && search.start <= search.end) {
    const startParts = formatZonedDateTimeParts(search.start, timeZone);
    const endParts = formatZonedDateTimeParts(search.end, timeZone);
    const calendarRange = createCustomDateRange(startParts.date, endParts.date);
    if (calendarRange) {
      return {
        ...calendarRange,
        preset: search.range ?? "custom",
        startTimestamp: search.start,
        endTimestamp: search.end,
        timeZone,
      };
    }
  }

  if (search.range && search.range !== "custom") {
    return createZonedDateRange(search.range, timeZone, referenceDate);
  }
  if (search.range === "custom" && search.from && search.to) {
    const customRange = createCustomDateRange(search.from, search.to);
    if (customRange) return withExactTimeRange(customRange, "00:00:00", "23:59:59", timeZone);
  }
  return createZonedDateRange(fallback, timeZone, referenceDate);
}

export function requestLogRangeSearchPatch(
  range: DateRangeValue,
  fallback: Exclude<DateRangePreset, "custom">,
): SearchPatch<RequestLogSearch> {
  const custom = range.preset === "custom";
  return {
    from: custom ? range.from : undefined,
    to: custom ? range.to : undefined,
    range: range.preset === fallback ? undefined : range.preset,
    start: range.startTimestamp,
    end: range.endTimestamp,
    tz: range.timeZone,
  };
}

function parseDateRangeSearch(search: Record<string, unknown>): DateRangeSearch {
  return {
    from: parseDateKey(search.from),
    range: parseEnum(search.range, [
      "today",
      "yesterday",
      "3d",
      "7d",
      "14d",
      "30d",
      "90d",
      "180d",
      "custom",
    ]),
    to: parseDateKey(search.to),
  };
}

function parseDateKey(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = localDateFromKey(value);
  return localDateToKey(date) === value ? value : undefined;
}

function parseEnum<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
): Value | undefined {
  return typeof value === "string" && allowed.includes(value as Value)
    ? (value as Value)
    : undefined;
}

function parseKeyword(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const keyword = value.trim().slice(0, 128);
  return keyword || undefined;
}

function parsePositiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 10_000 ? parsed : undefined;
}

function parseUnixTimestamp(value: unknown): number | undefined {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 253_402_300_799 ? parsed : undefined;
}

function parseTimeZone(value: unknown): string | undefined {
  return typeof value === "string" && isValidTimeZone(value) ? value : undefined;
}

function parsePageSize(
  value: unknown,
  allowed: readonly number[] = [10, 20, 50, 100],
): number | undefined {
  const parsed = parsePositiveInteger(value);
  return parsed && allowed.includes(parsed) ? parsed : undefined;
}
