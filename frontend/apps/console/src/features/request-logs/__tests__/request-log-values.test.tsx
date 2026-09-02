import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { RequestLogAnalytics, RequestLogRecord } from "@/data/contracts";
import { RequestLogsPage } from "../pages/request-logs-page";

const { getRequestLog, getRequestLogAnalytics, getRequestLogsPage } = vi.hoisted(() => ({
  getRequestLog: vi.fn(),
  getRequestLogAnalytics: vi.fn(),
  getRequestLogsPage: vi.fn(),
}));

vi.mock("@/data/repository", () => ({
  repository: { getRequestLog, getRequestLogAnalytics, getRequestLogsPage },
}));

vi.mock("@/components/date-range-picker", () => ({
  DateRangePicker: () => <button type="button">Date range</button>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "zh-CN" },
    t: (key: string, values?: Record<string, string | number>) => {
      if (!values) return key;
      return Object.entries(values).reduce(
        (label, [name, value]) => label.replace(`{{${name}}}`, String(value)),
        key,
      );
    },
  }),
}));

beforeEach(() => {
  getRequestLog.mockReset();
  getRequestLogAnalytics.mockReset();
  getRequestLogsPage.mockReset();
  getRequestLogAnalytics.mockResolvedValue(requestAnalyticsFixture());
});

describe("RequestLogsPage values", () => {
  test("queries only today when the URL has no date range", async () => {
    configureRequestLogs([]);

    renderRequestLogsPage();

    await waitFor(() =>
      expect(getRequestLogsPage).toHaveBeenCalledWith(
        expect.objectContaining({
          range: expect.objectContaining({ preset: "today" }),
        }),
      ),
    );
    expect(getRequestLogAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        range: expect.objectContaining({ preset: "today" }),
      }),
    );
  });

  test("keeps sub-cent costs visible and formats coarse request durations honestly", async () => {
    const logs: RequestLogRecord[] = [
      requestLogFixture({
        id: "req-three-seconds",
        cost: 0.00136,
        latencyMs: 3_000,
      }),
      requestLogFixture({
        id: "req-under-one-second",
        cost: 0.00001,
        latencyMs: 0,
      }),
    ];
    getRequestLogsPage.mockResolvedValue({
      items: logs,
      page: 1,
      pageSize: 20,
      total: logs.length,
    });

    renderRequestLogsPage();

    const threeSecondRow = within(
      (await screen.findByRole("button", { name: "req-three-seconds" })).closest("tr")!,
    );
    expect(threeSecondRow.getByText("3 s")).toBeVisible();
    expect(threeSecondRow.getByText("US$0.00136")).toBeVisible();

    const subSecondRow = within(
      screen.getByRole("button", { name: "req-under-one-second" }).closest("tr")!,
    );
    expect(subSecondRow.getByText("< 1 s")).toBeVisible();
    expect(subSecondRow.getByText("US$0.00001")).toBeVisible();

    expect(screen.queryByText("0 ms")).not.toBeInTheDocument();
  });

  test("shows complete filtered statistics and switches chart metrics", async () => {
    configureRequestLogs([requestLogFixture({ id: "req-visible-page" })]);
    getRequestLogAnalytics.mockResolvedValue(
      requestAnalyticsFixture({
        requestCount: 125,
        failureCount: 5,
        failureRate: 4,
        peakRpm: 18,
        peakTpm: 13_600,
        totalTokens: 248_000,
        totalCost: 2.42137,
        cacheHitTokens: 62_000,
        cacheHitRate: 25,
      }),
    );

    renderRequestLogsPage();

    expect(await screen.findByText("125")).toBeVisible();
    expect(screen.getByText("4%")).toBeVisible();
    expect(screen.getByText("18")).toBeVisible();
    expect(screen.getByText("13,600")).toBeVisible();
    expect(screen.getByText("248,000")).toBeVisible();
    expect(screen.getByText("US$2.42137")).toBeVisible();
    expect(screen.getByText("25%")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Cost" }));
    expect(screen.getByRole("tab", { name: "Cost" })).toHaveAttribute("aria-selected", "true");
  });

  test("shows an unavailable marker when a request has no recorded endpoint", async () => {
    configureRequestLogs([requestLogFixture({ id: "req-without-endpoint", endpoint: "" })]);

    renderRequestLogsPage();

    const row = (await screen.findByRole("button", { name: "req-without-endpoint" })).closest(
      "tr",
    )!;
    expect(within(row).getAllByRole("cell")[3]).toHaveTextContent("—");
  });

  test("shows user-facing trace identifiers and source IP without routing internals", async () => {
    configureRequestLogs([observableRequestLog()]);

    renderRequestLogsPage();
    const requestButton = await screen.findByRole("button", {
      name: "req-observable",
    });
    expect(within(requestButton.closest("tr")!).getByText("203.0.113.24")).toBeVisible();
    fireEvent.click(requestButton);

    const details = await screen.findByRole("dialog");
    expect(details).toHaveAttribute("data-slot", "sheet-content");
    expect(details).toHaveAttribute("data-side", "right");
    expect(details).toHaveTextContent("req-observable");
    await screen.findByText("service-trace-42");
    expect(details).toHaveTextContent("service-trace-42");
    expect(details).toHaveTextContent("Service trace ID");
    expect(details).toHaveTextContent("203.0.113.24");
    expect(details).toHaveTextContent("Production key");
    expect(details).toHaveTextContent("priority");
    expect(details).toHaveTextContent("420 ms");
    expect(details).toHaveTextContent("20 tokens/s");
  });

  test("shows token and billing evidence in a dedicated tab", async () => {
    configureRequestLogs([observableRequestLog()]);

    renderRequestLogsPage();
    fireEvent.click(await screen.findByRole("button", { name: "req-observable" }));
    fireEvent.click(await screen.findByRole("tab", { name: "Usage and billing" }));

    const details = screen.getByRole("dialog");
    expect(details).toHaveTextContent("Total tokens150");
    expect(details).toHaveTextContent("Total input tokens180");
    expect(details).toHaveTextContent("Input tokens100");
    expect(details).toHaveTextContent("Cache read40");
    expect(details).toHaveTextContent("Cache write total10");
    expect(details).toHaveTextContent("5m cache write4");
    expect(details).toHaveTextContent("1h cache write6");
    expect(details).toHaveTextContent("Audio input tokens3");
    expect(details).toHaveTextContent("Tool call charges");
    expect(details).toHaveTextContent("web_search");
    expect(details).toHaveTextContent("Developer Pro");
    expect(details).toHaveTextContent("Subscription usage for this request");
    expect(details).toHaveTextContent("US$0.00136");
    expect(details).not.toHaveTextContent("Estimated charge");
    expect(details).not.toHaveTextContent("Pre-consumed");
    expect(details).not.toHaveTextContent("Billing adjustment");
    expect(details).toHaveTextContent("Unsettled amount");
    expect(details).not.toHaveTextContent("tiered_expr");
    expect(details).not.toHaveTextContent("standard");
  });

  test("shows a recorded total without inventing a missing total-input value", async () => {
    configureRequestLogs([
      requestLogFixture({
        id: "req-basic-usage",
        inputTokens: 21,
        outputTokens: 250,
      }),
    ]);

    renderRequestLogsPage();
    fireEvent.click(await screen.findByRole("button", { name: "req-basic-usage" }));
    fireEvent.click(await screen.findByRole("tab", { name: "Usage and billing" }));

    const details = screen.getByRole("dialog");
    expect(details).toHaveTextContent("Total tokens271");
    expect(details).toHaveTextContent("Input tokens21");
    expect(details).toHaveTextContent("Output tokens250");
    expect(details).not.toHaveTextContent("Total input tokens");
    expect(details).not.toHaveTextContent("Not recorded");
  });

  test("shows task context only for task requests", async () => {
    configureRequestLogs([observableRequestLog()]);

    renderRequestLogsPage();
    fireEvent.click(await screen.findByRole("button", { name: "req-observable" }));

    const details = await screen.findByRole("dialog");
    await within(details).findByText("Task information");
    expect(details).toHaveTextContent("Task information");
    expect(details).toHaveTextContent("task-public-42");
    expect(details).toHaveTextContent("video");
    expect(details).toHaveTextContent("FAILURE");
    expect(details).toHaveTextContent("12 s");
    expect(details).toHaveTextContent("generation failed");
  });

  test("shows service runtime diagnostics without exposing model routing", async () => {
    configureRequestLogs([observableRequestLog()]);

    renderRequestLogsPage();
    fireEvent.click(await screen.findByRole("button", { name: "req-observable" }));
    fireEvent.click(await screen.findByRole("tab", { name: "Diagnostics" }));

    const details = screen.getByRole("dialog");
    expect(details).toHaveTextContent("Service diagnostics");
    expect(details).not.toHaveTextContent("OpenAI Compatible → Gemini");
    expect(details).not.toHaveTextContent("gemini-2.5-pro");
    expect(details).not.toHaveTextContent("Model mapping");
    expect(details).toHaveTextContent("length");
    expect(details).toHaveTextContent("completed");
    expect(details).toHaveTextContent("Normalized usage");
    expect(details).toHaveTextContent("Anthropic usage semantics");
    expect(details).toHaveTextContent("Request policy");
    expect(details).toHaveTextContent("Applied");
  });

  test("shows the recorded error type for failed requests", async () => {
    configureRequestLogs([
      requestLogFixture({
        id: "req-failed",
        status: "failed",
        statusCode: 429,
        errorCode: "rate_limit_exceeded",
        errorType: "rate_limit_error",
        errorMessage: "Request rate exceeded",
      }),
    ]);

    renderRequestLogsPage();
    fireEvent.click(await screen.findByRole("button", { name: "req-failed" }));
    fireEvent.click(await screen.findByRole("tab", { name: "Diagnostics" }));

    const details = screen.getByRole("dialog");
    expect(details).toHaveTextContent("Error type");
    expect(details).toHaveTextContent("rate_limit_error");
  });

  test("restores a shared request detail and persists the selected diagnostics tab", async () => {
    configureRequestLogs([observableRequestLog()]);
    const onSearchChange = vi.fn();

    renderRequestLogsPage(
      <RequestLogsPage
        onSearchChange={onSearchChange}
        search={{
          detail: "req-observable",
          detailTab: "usage",
          q: "req-observable",
        }}
      />,
    );

    expect(await screen.findByRole("dialog")).toHaveTextContent("req-observable");
    expect(await screen.findByRole("tab", { name: "Usage and billing" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Diagnostics" }));
    expect(onSearchChange).toHaveBeenCalledWith({ detailTab: "diagnostics" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onSearchChange).toHaveBeenCalledWith({
      detail: undefined,
      detailTab: undefined,
    });
  });

  test("keeps table context visible while request logs are loading", async () => {
    let resolveLogs: (value: {
      items: RequestLogRecord[];
      page: number;
      pageSize: number;
      total: number;
    }) => void = () => {};
    getRequestLogsPage.mockReturnValue(
      new Promise((resolve) => {
        resolveLogs = resolve;
      }),
    );

    renderRequestLogsPage();

    expect(screen.getByRole("columnheader", { name: "Request ID" })).toBeVisible();
    expect(screen.getAllByRole("row", { name: "Loading" })).toHaveLength(3);
    expect(screen.queryByText("No matching requests")).not.toBeInTheDocument();

    resolveLogs({ items: [], page: 1, pageSize: 20, total: 0 });
    expect(await screen.findByText("No matching requests")).toBeVisible();
  });

  test("keeps the last usable statistics and logs visible when a background refresh fails", async () => {
    const log = requestLogFixture({ id: "req-stale-but-usable" });
    configureRequestLogs([log]);
    getRequestLogAnalytics.mockResolvedValue(
      requestAnalyticsFixture({ requestCount: 1, totalTokens: 15 }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <RequestLogsPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("button", { name: "req-stale-but-usable" })).toBeVisible();
    expect(screen.getAllByText("15").length).toBeGreaterThan(0);
    getRequestLogsPage.mockRejectedValue(new Error("temporary log refresh failure"));
    getRequestLogAnalytics.mockRejectedValue(new Error("temporary analytics refresh failure"));

    await act(async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["request-logs"] }),
        queryClient.invalidateQueries({ queryKey: ["request-log-analytics"] }),
      ]);
    });
    await waitFor(() => expect(getRequestLogsPage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getRequestLogAnalytics).toHaveBeenCalledTimes(2));

    expect(screen.getByRole("button", { name: "req-stale-but-usable" })).toBeVisible();
    expect(screen.getAllByText("15").length).toBeGreaterThan(0);
    expect(screen.queryByText("Unable to load request statistics")).not.toBeInTheDocument();
    expect(screen.queryByText("Unable to load request logs")).not.toBeInTheDocument();
  });

  test("does not substitute another request when a shared detail is unavailable", async () => {
    configureRequestLogs([observableRequestLog()]);
    const onSearchChange = vi.fn();

    renderRequestLogsPage(
      <RequestLogsPage
        onSearchChange={onSearchChange}
        search={{ detail: "req-missing", q: "req-missing" }}
      />,
    );

    expect(await screen.findByText("Request details unavailable")).toBeVisible();
    expect(screen.getByRole("dialog")).not.toHaveTextContent("service-trace-42");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onSearchChange).toHaveBeenCalledWith({
      detail: undefined,
      detailTab: undefined,
    });
  });
});

function renderRequestLogsPage(page: ReactNode = <RequestLogsPage />) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{page}</QueryClientProvider>);
}

function requestLogFixture(overrides: Partial<RequestLogRecord>): RequestLogRecord {
  return {
    id: "req-default",
    endpoint: "/v1/chat/completions",
    model: "gpt-5",
    apiKeyName: "Model test",
    createdAt: 1_787_979_512,
    status: "succeeded",
    statusCode: 200,
    inputTokens: 11,
    outputTokens: 4,
    latencyMs: 1_000,
    cost: 0.001,
    errorCode: null,
    errorMessage: null,
    ...overrides,
  };
}

function configureRequestLogs(logs: RequestLogRecord[]) {
  getRequestLogsPage.mockResolvedValue({
    items: logs,
    page: 1,
    pageSize: 20,
    total: logs.length,
  });
  getRequestLog.mockImplementation(async (requestId: string) => {
    const request = logs.find((item) => item.id === requestId);
    if (!request) throw new Error("request not found");
    return request;
  });
}

function requestAnalyticsFixture(
  overrides: Partial<RequestLogAnalytics> = {},
): RequestLogAnalytics {
  return {
    requestCount: 0,
    failureCount: 0,
    failureRate: null,
    peakRpm: 0,
    peakTpm: 0,
    totalTokens: 0,
    totalCost: 0,
    cacheHitTokens: 0,
    cacheHitRate: null,
    series: [
      {
        bucketStart: 1_787_961_600,
        bucketSeconds: 3_600,
        succeeded: 1,
        failed: 0,
        rpm: 1 / 60,
        tpm: 15 / 60,
        tokens: 15,
        cost: 0.001,
        cacheHitTokens: 0,
        cacheHitRate: 0,
      },
    ],
    ...overrides,
  };
}

function observableRequestLog(): RequestLogRecord {
  return Object.assign(
    requestLogFixture({
      id: "req-observable",
      apiKeyName: "Production key",
      inputTokens: 100,
      outputTokens: 50,
      latencyMs: 2_500,
      cost: 0.00136,
    }),
    {
      serviceTraceId: "service-trace-42",
      sourceIp: "203.0.113.24",
      group: "priority",
      isStream: true,
      firstTokenLatencyMs: 420,
      cacheReadTokens: 40,
      cacheWriteTokens: 10,
      cacheWrite5mTokens: 4,
      cacheWrite1hTokens: 6,
      inputTokensTotal: 180,
      imageTokens: 7,
      audioInputTokens: 3,
      audioOutputTokens: 2,
      textInputTokens: 100,
      textOutputTokens: 50,
      toolSurcharges: [{ name: "web_search", count: 2, unitPrice: 10, totalCost: 0.02 }],
      billingMode: "tiered_expr",
      billingTier: "standard",
      billingSource: "subscription",
      billingPreference: "subscription_first",
      billingStage: "completed",
      estimatedCost: 0.0012,
      preConsumedCost: 0.0015,
      finalCost: 0.00136,
      adjustmentCost: -0.00014,
      outstandingCost: 0.00004,
      subscriptionPlanTitle: "Developer Pro",
      subscriptionConsumedCost: 0.00136,
      subscriptionRemainingCost: 0.01864,
      usageSemantic: "anthropic",
      usageCountSource: "normalized_usage",
      requestPolicyApplied: true,
      task: {
        id: "task-public-42",
        platform: "video",
        action: "generate",
        status: "FAILURE",
        durationMs: 12_000,
        refundedCost: 0.00136,
        failureReason: "generation failed",
        refundReason: null,
      },
      reasoningEffort: "high",
      streamStatus: {
        status: "completed",
        endReason: "length",
        errorCount: 0,
        endError: null,
        errors: [],
      },
      content: null,
    },
  );
}
