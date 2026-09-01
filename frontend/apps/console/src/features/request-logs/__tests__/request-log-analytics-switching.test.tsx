import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { RequestLogAnalytics } from "@/data/contracts";
import { RequestLogAnalyticsCard } from "../components/request-log-analytics-card";

const chartState = vi.hoisted(() => ({ failAreaChart: false }));

vi.mock("recharts", () => ({
  Area: () => null,
  AreaChart: (props: { children?: ReactNode }) => {
    if (chartState.failAreaChart) throw new Error("chart transition failed");
    return <div data-testid="area-chart">{props.children}</div>;
  },
  Bar: () => null,
  BarChart: (props: { children?: ReactNode }) => (
    <div data-testid="bar-chart">{props.children}</div>
  ),
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

vi.mock("@token-boat/ui/components/ui/chart", () => ({
  ChartContainer: (props: ComponentProps<"div">) => <div {...props} />,
  ChartTooltip: (props: { content?: ReactNode }) => props.content ?? null,
  ChartTooltipContent: (props: {
    labelFormatter?: (
      value: unknown,
      payload: Array<{ payload?: { bucketStart?: number } }>,
    ) => ReactNode;
  }) => (
    <div data-testid="tooltip-label">
      {props.labelFormatter?.("Configured metric label", [
        { payload: { bucketStart: 1_788_192_000 } },
      ])}
    </div>
  ),
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
  chartState.failAreaChart = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("keeps the request-log page usable when a metric chart fails during switching", () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const data: RequestLogAnalytics = {
    requestCount: 2,
    failureCount: 0,
    failureRate: 0,
    peakRpm: 1,
    peakTpm: 20,
    totalTokens: 30,
    totalCost: 0.01,
    cacheHitTokens: 0,
    cacheHitRate: null,
    series: [
      {
        bucketStart: 1_788_192_000,
        bucketSeconds: 3_600,
        succeeded: 2,
        failed: 0,
        rpm: 1,
        tpm: 20,
        tokens: 30,
        cost: 0.01,
        cacheHitTokens: 0,
        cacheHitRate: null,
      },
    ],
  };

  render(
    <RequestLogAnalyticsCard
      data={data}
      error={false}
      loading={false}
      onRetry={vi.fn()}
      retrying={false}
    />,
  );

  expect(screen.getByTestId("bar-chart")).toBeVisible();
  expect(screen.getByTestId("tooltip-label")).not.toBeEmptyDOMElement();
  chartState.failAreaChart = true;
  fireEvent.click(screen.getByRole("tab", { name: "Cost" }));

  expect(screen.getByRole("alert")).toHaveTextContent("Unable to display this statistic");
  expect(screen.getByText("Request statistics")).toBeVisible();
  expect(screen.getByRole("tab", { name: "Requests" })).toBeVisible();

  chartState.failAreaChart = false;
  fireEvent.click(screen.getByRole("tab", { name: "Requests" }));
  expect(screen.getByTestId("bar-chart")).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("does not infer a cache statistic when the selected range has no recorded values", () => {
  const data: RequestLogAnalytics = {
    requestCount: 1,
    failureCount: 0,
    failureRate: 0,
    peakRpm: 1,
    peakTpm: 20,
    totalTokens: 30,
    totalCost: 0.01,
    cacheHitTokens: 0,
    cacheHitRate: null,
    series: [
      {
        bucketStart: 1_788_192_000,
        bucketSeconds: 3_600,
        succeeded: 1,
        failed: 0,
        rpm: 1,
        tpm: 20,
        tokens: 30,
        cost: 0.01,
        cacheHitTokens: 0,
        cacheHitRate: null,
      },
    ],
  };

  render(
    <RequestLogAnalyticsCard
      data={data}
      error={false}
      loading={false}
      onRetry={vi.fn()}
      retrying={false}
    />,
  );

  fireEvent.click(screen.getByRole("tab", { name: "Cache hit rate" }));

  expect(screen.getByRole("status")).toHaveTextContent("No recorded data for this statistic");
  expect(screen.getByRole("status")).toHaveTextContent("No value has been inferred");
  expect(screen.queryByTestId("area-chart")).not.toBeInTheDocument();
});

test("explains every request-statistics summary field from the title help action", () => {
  const data: RequestLogAnalytics = {
    requestCount: 2,
    failureCount: 0,
    failureRate: 0,
    peakRpm: 1,
    peakTpm: 20,
    totalTokens: 30,
    totalCost: 0.01,
    cacheHitTokens: 0,
    cacheHitRate: null,
    series: [],
  };

  render(
    <RequestLogAnalyticsCard
      data={data}
      error={false}
      loading={false}
      onRetry={vi.fn()}
      retrying={false}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Explain request statistics" }));

  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveTextContent("Request statistics explained");
  expect(dialog).toHaveTextContent(
    "All values use the current time range and filters. Summary totals cover the full range; peak RPM and peak TPM are one-minute maxima.",
  );
  const definitions: ReadonlyArray<readonly [string, string]> = [
    ["Requests", "Total successful and failed requests matching the current filters."],
    ["Failure rate", "Failed requests divided by all requests."],
    ["Peak RPM", "The highest number of requests recorded in any one-minute interval."],
    [
      "Peak TPM",
      "The highest total of input and output tokens recorded in any one-minute interval.",
    ],
    ["Tokens", "Total input and output tokens from successful requests."],
    ["Cost", "Total billed usage cost from successful requests, shown in USD."],
    [
      "Cache hit rate",
      "Cache-read tokens divided by provider-reported total input tokens. Shown as unavailable when complete input-token data is missing.",
    ],
  ];
  for (const [label, description] of definitions) {
    expect(within(dialog).getByText(label)).toBeVisible();
    expect(within(dialog).getByText(description)).toBeVisible();
  }
  expect(within(dialog).getByText("RPM and TPM charts")).toBeVisible();
  expect(dialog).toHaveTextContent(
    "Chart RPM and TPM points are per-minute averages within each displayed time bucket, not one-minute peaks. The bucket size adjusts to the selected date range.",
  );
  expect(dialog).toHaveTextContent(
    "RPM equals requests in the bucket divided by bucket minutes. TPM equals input and output tokens in the bucket divided by bucket minutes.",
  );
});
