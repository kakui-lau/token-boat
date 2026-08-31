import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { UsageData } from "@/data/contracts";
import { UsagePage } from "../pages/usage-page";

const { getUsage } = vi.hoisted(() => ({ getUsage: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    search,
    to,
    ...props
  }: {
    children?: ReactNode;
    search?: Record<string, unknown>;
    to: string;
  }) => (
    <a data-search={search ? JSON.stringify(search) : undefined} href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/date-range-picker", () => ({
  DateRangePicker: () => <button type="button">Date range</button>,
}));

vi.mock("@/data/repository", () => ({ repository: { getUsage } }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string) => key,
  }),
}));

beforeEach(() => getUsage.mockReset());

describe("UsagePage request chart", () => {
  test("replaces empty axes with an actionable no-request state", async () => {
    getUsage.mockResolvedValue(usageFixture());

    renderUsagePage();

    expect(await screen.findByText("No requests in this period")).toBeVisible();
    expect(screen.getByRole("button", { name: "View last 30 days" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Open Playground" })).toHaveAttribute(
      "href",
      "/playground",
    );
    expect(screen.queryByLabelText("Request volume chart")).not.toBeInTheDocument();
  });

  test("explains when totals exist but the daily series is unavailable", async () => {
    getUsage.mockResolvedValue(usageFixture({ totalRequests: 12 }));

    renderUsagePage();

    expect(await screen.findByText("Daily trend is not available yet")).toBeVisible();
    expect(screen.getByRole("button", { name: "View request logs" })).toHaveAttribute(
      "href",
      "/logs",
    );
  });

  test("shows a retry action when the request trend cannot be loaded", async () => {
    getUsage.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(usageFixture());

    renderUsagePage();

    expect(await screen.findByText("Unable to load usage data")).toBeVisible();
    expect(screen.queryByText("Usage by model")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("No requests in this period")).toBeVisible();
  });

  test("surfaces success rate and links a recent request to its exact log search", async () => {
    getUsage.mockResolvedValue(
      usageFixture({
        successRate: 98.75,
        recentRequests: [
          {
            id: "request-20260830",
            event: "chat",
            model: "gpt-5",
            createdAt: 1_788_067_200,
            status: "succeeded",
          },
        ],
      }),
    );

    renderUsagePage();

    expect(await screen.findByText("98.75%")).toBeVisible();
    expect(screen.getByRole("link", { name: "Request ID: request-20260830" })).toHaveAttribute(
      "data-search",
      JSON.stringify({
        detail: "request-20260830",
        field: "request",
        q: "request-20260830",
      }),
    );
  });

  test("sorts model usage by tokens descending and lets every column change the order", async () => {
    getUsage.mockResolvedValue(
      usageFixture({
        models: [
          { model: "beta", requests: 20, tokens: 100, cost: 2, successRate: null },
          { model: "alpha", requests: 10, tokens: 300, cost: 1, successRate: 99 },
          { model: "gamma", requests: 30, tokens: 200, cost: 3, successRate: 98 },
        ],
      }),
    );

    renderUsagePage();

    const table = await screen.findByRole("table", { name: "Usage by model" });
    await within(table).findByTitle("alpha");
    const modelNames = () =>
      within(table)
        .getAllByRole("row")
        .slice(1)
        .map((row) =>
          within(row).getAllByRole("cell")[0]?.querySelector("span")?.getAttribute("title"),
        );

    expect(modelNames()).toEqual(["alpha", "gamma", "beta"]);
    expect(within(table).getByRole("columnheader", { name: "Tokens" })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
    expect(within(table).getAllByRole("button")).toHaveLength(5);

    fireEvent.click(within(table).getByRole("button", { name: "Requests" }));
    expect(modelNames()).toEqual(["gamma", "beta", "alpha"]);

    fireEvent.click(within(table).getByRole("button", { name: "Requests" }));
    expect(modelNames()).toEqual(["alpha", "beta", "gamma"]);

    fireEvent.click(within(table).getByRole("button", { name: "Model" }));
    expect(modelNames()).toEqual(["alpha", "beta", "gamma"]);
  });

  test("renders spend trend and real API key and model breakdown charts", async () => {
    getUsage.mockResolvedValue(
      usageFixture({
        totalRequests: 3,
        totalCost: 6,
        series: [
          { date: "2026-08-27", requests: 1, tokens: 100, cost: 2 },
          { date: "2026-08-28", requests: 2, tokens: 200, cost: 4 },
        ],
        apiKeys: [
          {
            apiKeyId: 1,
            apiKeyName: "Production",
            requests: 2,
            tokens: 200,
            cost: 4,
            successRate: 100,
          },
          {
            apiKeyId: 2,
            apiKeyName: "Batch",
            requests: 1,
            tokens: 100,
            cost: 2,
            successRate: 100,
          },
        ],
        models: [
          { model: "gpt-5", requests: 2, tokens: 200, cost: 5, successRate: 100 },
          { model: "claude-4", requests: 1, tokens: 100, cost: 1, successRate: 100 },
        ],
      }),
    );

    renderUsagePage();

    expect(await screen.findByLabelText("Spend trend chart")).toBeVisible();
    expect(screen.getByLabelText("Spend by API key chart")).toBeVisible();
    expect(screen.getByLabelText("Spend by model chart")).toBeVisible();
  });
});

function renderUsagePage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UsagePage />
    </QueryClientProvider>,
  );
}

function usageFixture(overrides: Partial<UsageData> = {}): UsageData {
  return {
    range: { preset: "7d", from: "2026-08-22", to: "2026-08-28" },
    totalRequests: 0,
    totalTokens: 0,
    totalCost: 0,
    averageLatencyMs: 0,
    successRate: 0,
    series: [],
    models: [],
    apiKeys: [],
    recentRequests: [],
    ...overrides,
  };
}
