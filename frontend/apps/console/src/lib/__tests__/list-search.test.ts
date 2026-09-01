import { describe, expect, it } from "vitest";

import {
  dateRangeSearchPatch,
  parseAccountActivitySearch,
  parseApiKeySearch,
  parseBillingSearch,
  parseModelSearch,
  parseOverviewSearch,
  parsePlaygroundSearch,
  parseRequestLogSearch,
  parseTaskSearch,
  resolveDateRange,
  searchPatchShouldResetScroll,
  type RequestLogSearch,
} from "../list-search";

const referenceDate = new Date(2026, 7, 28, 12);

describe("list search parameters", () => {
  it("keeps valid API key filters and removes malformed pagination values", () => {
    expect(
      parseApiKeySearch({
        detail: "42",
        order: "asc",
        page: "3",
        pageSize: "25",
        q: "  Production app  ",
        status: "disabled",
      }),
    ).toEqual({
      detail: 42,
      order: "asc",
      page: 3,
      pageSize: undefined,
      q: "Production app",
      status: "disabled",
    });
  });

  it("restores a valid custom date range and falls back for invalid calendar dates", () => {
    const customSearch = parseRequestLogSearch({
      from: "2026-08-01",
      range: "custom",
      to: "2026-08-28",
    });
    expect(resolveDateRange(customSearch, "7d", referenceDate)).toEqual({
      from: "2026-08-01",
      preset: "custom",
      to: "2026-08-28",
    });

    const invalidSearch = parseRequestLogSearch({
      from: "2026-02-30",
      range: "custom",
      to: "2026-08-28",
    });
    expect(resolveDateRange(invalidSearch, "7d", referenceDate)).toEqual({
      from: "2026-08-22",
      preset: "7d",
      to: "2026-08-28",
    });
  });

  it("keeps the public service-trace search field", () => {
    expect(
      parseRequestLogSearch({
        detail: " request-42 ",
        detailTab: "diagnostics",
        field: "service_trace",
      }),
    ).toMatchObject({
      detail: "request-42",
      detailTab: "diagnostics",
      field: "service_trace",
    });
    expect(parseRequestLogSearch({ detailTab: "routing" })).toMatchObject({
      detailTab: undefined,
    });
    expect(parseRequestLogSearch({ detailTab: "usage" })).toMatchObject({
      detailTab: undefined,
    });
  });

  it("keeps only supported account activity filters", () => {
    expect(
      parseAccountActivitySearch({
        detail: " activity-42 ",
        order: "asc",
        page: "2",
        type: "login",
      }),
    ).toMatchObject({
      detail: "activity-42",
      order: "asc",
      page: 2,
      type: "login",
    });
    expect(parseAccountActivitySearch({ type: "request" })).toMatchObject({ type: undefined });
  });

  it("serializes quick defaults compactly and preserves exact custom dates", () => {
    expect(
      dateRangeSearchPatch({ from: "2026-08-22", preset: "7d", to: "2026-08-28" }, "7d"),
    ).toEqual({ from: undefined, range: undefined, to: undefined });
    expect(
      dateRangeSearchPatch({ from: "2026-08-15", preset: "custom", to: "2026-08-28" }, "7d"),
    ).toEqual({ from: "2026-08-15", range: "custom", to: "2026-08-28" });
  });

  it("keeps overview date ranges shareable in the URL", () => {
    expect(parseOverviewSearch({ from: "2026-08-01", range: "custom", to: "2026-08-28" })).toEqual({
      from: "2026-08-01",
      range: "custom",
      to: "2026-08-28",
    });
    expect(parseOverviewSearch({ from: "invalid", range: "all", to: "2026-08-28" })).toEqual({
      from: undefined,
      range: undefined,
      to: "2026-08-28",
    });
    expect(parseOverviewSearch({ range: "365d" })).toMatchObject({ range: "365d" });
  });

  it("accepts task card page sizes and keeps payment and ledger filters isolated", () => {
    expect(
      parseTaskSearch({
        detail: " task-video-42 ",
        pageSize: "24",
        status: "processing",
        type: "video",
      }),
    ).toMatchObject({
      detail: "task-video-42",
      pageSize: 24,
      status: "processing",
      type: "video",
    });
    expect(parseTaskSearch({ pageSize: "20", type: "document" })).toMatchObject({
      pageSize: undefined,
      type: undefined,
    });
    expect(
      parseBillingSearch({
        detail: "order-hidden-on-ledger",
        ledgerDetail: " balance-event-42 ",
        ledgerOrder: "asc",
        ledgerPage: "3",
        ledgerPageSize: "50",
        ledgerType: "refund",
        tab: "ledger",
        type: "subscription",
      }),
    ).toMatchObject({
      detail: undefined,
      ledgerDetail: "balance-event-42",
      ledgerOrder: "asc",
      ledgerPage: 3,
      ledgerPageSize: 50,
      ledgerType: "refund",
      tab: "ledger",
      type: "subscription",
    });
    expect(parseBillingSearch({ ledgerType: "usage", tab: "unknown" })).toMatchObject({
      detail: undefined,
      ledgerDetail: undefined,
      ledgerType: undefined,
      tab: undefined,
    });
    expect(parseBillingSearch({ detail: " payment-order-42 " })).toMatchObject({
      detail: "payment-order-42",
      ledgerDetail: undefined,
    });
    expect(
      parseBillingSearch({
        detail: "order-hidden-on-plans",
        ledgerDetail: "event-hidden",
        tab: "plans",
      }),
    ).toMatchObject({ detail: undefined, ledgerDetail: undefined, tab: "plans" });
  });

  it("keeps supported model discovery filters and a safe Playground model ID", () => {
    expect(parseModelSearch({ availability: "all", family: "video", q: "  veo-3  " })).toEqual({
      availability: "all",
      detail: undefined,
      family: "video",
      q: "veo-3",
    });
    expect(parseModelSearch({ availability: "offline", family: "document" })).toEqual({
      availability: undefined,
      detail: undefined,
      family: undefined,
      q: undefined,
    });
    expect(parseModelSearch({ detail: "  anthropic/claude-sonnet  " })).toMatchObject({
      detail: "anthropic/claude-sonnet",
    });
    expect(parsePlaygroundSearch({ model: "  anthropic/claude-sonnet-4-6  " })).toEqual({
      model: "anthropic/claude-sonnet-4-6",
    });
  });

  it("preserves page position for overlay-only URL changes", () => {
    expect(searchPatchShouldResetScroll({ detail: "model-42" }, ["detail"])).toBe(false);
    expect(searchPatchShouldResetScroll({ detail: undefined }, ["detail"])).toBe(false);
    expect(
      searchPatchShouldResetScroll<RequestLogSearch>({ detailTab: "usage" }, [
        "detail",
        "detailTab",
      ]),
    ).toBe(false);
    expect(searchPatchShouldResetScroll({ detail: undefined, q: "updated" }, ["detail"])).toBe(
      true,
    );
  });
});
