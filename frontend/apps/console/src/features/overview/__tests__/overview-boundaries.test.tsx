import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { OnboardingData, OverviewData } from "@/data/contracts";
import { OverviewPage } from "../pages/overview-page";

const { getOnboarding, getOverview } = vi.hoisted(() => ({
  getOnboarding: vi.fn(),
  getOverview: vi.fn(),
}));

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
  DateRangePicker: ({ onChange }: { onChange(value: unknown): void }) => (
    <button
      onClick={() => onChange({ preset: "30d", from: "2026-08-01", to: "2026-08-30" })}
      type="button"
    >
      Date range
    </button>
  ),
}));

vi.mock("@/data/repository", () => ({ repository: { getOnboarding, getOverview } }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string) => key,
  }),
}));

beforeEach(() => {
  getOnboarding.mockReset();
  getOverview.mockReset();
});

describe("OverviewPage data boundaries", () => {
  test("keeps setup and quick actions available when workspace statistics fail", async () => {
    getOverview.mockRejectedValue(new Error("offline"));
    getOnboarding.mockResolvedValue(onboardingFixture());

    renderOverviewPage();

    expect(await screen.findByText("Unable to load workspace overview")).toBeVisible();
    expect(screen.getByRole("link", { name: /Open Playground/ })).toHaveAttribute(
      "href",
      "/playground",
    );
    expect(screen.getByText("1 / 3")).toBeVisible();
    expect(screen.queryByText("Recent activity")).not.toBeInTheDocument();
  });

  test("keeps real workspace metrics visible when onboarding fails", async () => {
    getOverview.mockResolvedValue(overviewFixture());
    getOnboarding.mockRejectedValue(new Error("unavailable"));

    renderOverviewPage();

    expect(await screen.findByText("Unable to load setup progress")).toBeVisible();
    expect(screen.getByRole("link", { name: "Available balance: $42.50" })).toHaveAttribute(
      "href",
      "/billing",
    );
    expect(screen.getByRole("button", { name: /View onboarding guide/ })).toHaveAttribute(
      "href",
      "/getting-started",
    );
  });

  test("uses the returned checklist length and links each step to its action", async () => {
    getOverview.mockResolvedValue(overviewFixture());
    getOnboarding.mockResolvedValue(
      onboardingFixture({
        steps: [
          { id: "create-key", complete: true },
          { id: "first-request", complete: false },
        ],
      }),
    );

    renderOverviewPage();

    expect(await screen.findByText("1 / 2")).toBeVisible();
    expect(screen.getByText("Create your first API key").closest("a")).toHaveAttribute(
      "href",
      "/api-keys",
    );
    expect(screen.getByText("Send a request in Playground").closest("a")).toHaveAttribute(
      "href",
      "/playground",
    );
    expect(
      screen
        .getByRole("button", { name: /View onboarding guide/ })
        .closest('[data-slot="card-footer"]'),
    ).toHaveClass("mt-auto");
  });

  test("preserves the selected date range in search state and links activity to logs", async () => {
    const onSearchChange = vi.fn();
    getOverview.mockResolvedValue(
      overviewFixture({
        recentActivity: [
          {
            id: "request-42",
            event: "chat",
            model: "gpt-5",
            createdAt: 1_788_067_200,
            status: "succeeded",
          },
        ],
      }),
    );
    getOnboarding.mockResolvedValue(onboardingFixture());

    renderOverviewPage({ onSearchChange, search: {} });

    fireEvent.click(screen.getByRole("button", { name: "Date range" }));
    expect(onSearchChange).toHaveBeenCalledWith({
      from: undefined,
      range: "30d",
      to: undefined,
    });

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Chat completion" })).toHaveAttribute(
        "data-search",
        JSON.stringify({ range: "7d", detail: "request-42", field: "request", q: "request-42" }),
      ),
    );
  });
});

function renderOverviewPage(props: ComponentProps<typeof OverviewPage> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <OverviewPage {...props} />
    </QueryClientProvider>,
  );
}

function overviewFixture(overrides: Partial<OverviewData> = {}): OverviewData {
  return {
    activeApiKeys: 2,
    availableBalance: 42.5,
    recentActivity: [],
    requestCount: 128,
    successRate: 99.2,
    ...overrides,
  };
}

function onboardingFixture(overrides: Partial<OnboardingData> = {}): OnboardingData {
  return {
    baseUrl: "http://127.0.0.1:3000/v1",
    exampleModel: "gpt-5",
    steps: [
      { id: "create-key", complete: true },
      { id: "fund-account", complete: false },
      { id: "first-request", complete: false },
    ],
    ...overrides,
  };
}
