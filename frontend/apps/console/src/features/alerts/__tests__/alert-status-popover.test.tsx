import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AlertStatusPopover } from "../components/alert-status-popover";

const { getAlertCenter } = vi.hoisted(() => ({ getAlertCenter: vi.fn() }));

vi.mock("@/data/repository", () => ({
  repository: { getAlertCenter },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      if (!values) return key;
      return Object.entries(values).reduce(
        (label, [name, value]) => label.replace(`{{${name}}}`, String(value)),
        key,
      );
    },
  }),
}));

const alertCenter = {
  platform: {
    configured: true,
    monitors: [],
    status: "operational" as const,
    uptimePercent: 99.98,
  },
  rules: [
    {
      id: "balance-warning",
      type: "balance" as const,
      name: "Low balance",
      threshold: 2,
      channel: "email" as const,
      enabled: true,
      lastTriggeredAt: null,
    },
  ],
  incidents: [],
};

describe("AlertStatusPopover", () => {
  beforeEach(() => {
    getAlertCenter.mockReset();
  });

  test("defers loading until opened and shows only returned status facts", async () => {
    getAlertCenter.mockResolvedValue(alertCenter);
    const onOpenAlertCenter = vi.fn();

    renderPopover(onOpenAlertCenter);

    expect(getAlertCenter).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Alerts and status" }));

    expect(await screen.findByText("All systems operational")).toBeInTheDocument();
    expect(screen.getByText("99.98% minimum 24-hour uptime")).toBeInTheDocument();
    expect(screen.getByText("1 active alert rules")).toBeInTheDocument();
    expect(getAlertCenter).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Open alert center" }));
    expect(onOpenAlertCenter).toHaveBeenCalledOnce();
  });

  test("keeps request failures retryable without showing a fake platform state", async () => {
    getAlertCenter.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(alertCenter);

    renderPopover(vi.fn());
    fireEvent.click(screen.getByRole("button", { name: "Alerts and status" }));

    expect(await screen.findByText("Unable to load alerts and status")).toBeInTheDocument();
    expect(screen.queryByText("Platform status unavailable")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("All systems operational")).toBeInTheDocument();
    expect(getAlertCenter).toHaveBeenCalledTimes(2);
  });

  test("opens immediately after the shell loads the deferred popover", async () => {
    getAlertCenter.mockResolvedValue(alertCenter);

    renderPopover(vi.fn(), true);

    expect(await screen.findByText("All systems operational")).toBeInTheDocument();
    expect(getAlertCenter).toHaveBeenCalledOnce();
  });
});

function renderPopover(onOpenAlertCenter: () => void, initiallyOpen = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AlertStatusPopover initiallyOpen={initiallyOpen} onOpenAlertCenter={onOpenAlertCenter} />
    </QueryClientProvider>,
  );
}
