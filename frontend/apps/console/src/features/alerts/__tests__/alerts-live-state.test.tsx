import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AlertsPage } from "../pages/alerts-page";

const { getAlertCenter } = vi.hoisted(() => ({ getAlertCenter: vi.fn() }));

vi.mock("@/data/repository", () => ({
  repository: { getAlertCenter },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string, values?: Record<string, string | number>) => {
      if (!values) return key;
      return Object.entries(values).reduce(
        (label, [name, value]) => label.replace(`{{${name}}}`, String(value)),
        key,
      );
    },
  }),
}));

describe("AlertsPage live state", () => {
  beforeEach(() => {
    getAlertCenter.mockReset();
  });

  test("shows real capability boundaries and routes management to saved account settings", async () => {
    getAlertCenter.mockResolvedValue({
      platform: {
        configured: false,
        monitors: [],
        status: "unconfigured",
        uptimePercent: null,
      },
      rules: [
        {
          id: "balance-warning",
          type: "balance",
          name: "Low balance",
          threshold: 2,
          channel: "email",
          enabled: null,
          lastTriggeredAt: null,
        },
      ],
      incidents: [],
    });
    const onManageAlerts = vi.fn();

    renderAlertsPage(onManageAlerts);

    expect(await screen.findByText("Status monitoring not configured")).toBeInTheDocument();
    expect(screen.getByText("No service monitors configured")).toBeInTheDocument();
    expect(screen.getByText("Low balance")).toBeInTheDocument();
    expect(screen.getByText("Status unavailable")).toBeInTheDocument();
    expect(screen.getByText("No incident history available")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create alert" })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Manage alert settings" }));
    expect(onManageAlerts).toHaveBeenCalledOnce();
  });

  test("keeps loading placeholders separate from real empty and unavailable states", () => {
    getAlertCenter.mockReturnValue(new Promise(() => undefined));

    const view = renderAlertsPage(vi.fn());

    expect(view.container.firstChild).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Platform status unavailable")).not.toBeInTheDocument();
    expect(screen.queryByText("No service monitors configured")).not.toBeInTheDocument();
    expect(screen.queryByText("No incident history available")).not.toBeInTheDocument();
  });

  test("shows one retryable error instead of converting a failed request into status facts", async () => {
    getAlertCenter.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({
      platform: {
        configured: true,
        monitors: [],
        status: "operational",
        uptimePercent: 100,
      },
      rules: [],
      incidents: [],
    });

    renderAlertsPage(vi.fn());

    expect(await screen.findByText("Unable to load alerts and status")).toBeInTheDocument();
    expect(screen.queryByText("Platform status unavailable")).not.toBeInTheDocument();
    expect(screen.queryByText("No incident history available")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("All systems operational")).toBeInTheDocument();
    expect(getAlertCenter).toHaveBeenCalledTimes(2);
  });

  test("keeps saved alert rules visible while platform status is retried independently", async () => {
    const rules = [
      {
        id: "balance-warning",
        type: "balance" as const,
        name: "Low balance",
        threshold: 2,
        channel: "email" as const,
        enabled: null,
        lastTriggeredAt: null,
      },
    ];
    getAlertCenter
      .mockResolvedValueOnce({
        platform: {
          configured: null,
          monitors: [],
          status: "unknown",
          uptimePercent: null,
        },
        rules,
        incidents: [],
      })
      .mockResolvedValueOnce({
        platform: {
          configured: true,
          monitors: [],
          status: "operational",
          uptimePercent: 100,
        },
        rules,
        incidents: [],
      });

    renderAlertsPage(vi.fn());

    expect(await screen.findByText("Platform status unavailable")).toBeVisible();
    expect(screen.getByText("Low balance")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry status" }));

    expect(await screen.findByText("All systems operational")).toBeVisible();
    expect(getAlertCenter).toHaveBeenCalledTimes(2);
  });
});

function renderAlertsPage(onManageAlerts: () => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AlertsPage onManageAlerts={onManageAlerts} />
    </QueryClientProvider>,
  );
}
