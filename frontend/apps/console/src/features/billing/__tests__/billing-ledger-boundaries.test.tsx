import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { BillingLedgerEntry, DateRangeValue } from "@/data/contracts";
import type { BillingSearch, SearchPatch } from "@/lib/list-search";
import { BillingLedgerPanel } from "../components/billing-ledger-panel";

const { copyEventId, getBillingLedgerPage } = vi.hoisted(() => ({
  copyEventId: vi.fn(),
  getBillingLedgerPage: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children?: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/data/repository", () => ({ repository: { getBillingLedgerPage } }));

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

const range: DateRangeValue = { preset: "custom", from: "2026-08-01", to: "2026-08-30" };

const refundEntry: BillingLedgerEntry = {
  id: "billing-refund-202608300001",
  eventId: "billing-refund-202608300001",
  type: "refund",
  createdAt: 1_788_070_400,
  content: "Unused task reservation returned",
  sourceIp: null,
  amountUsd: 0.025,
  model: "seedance-2.0",
  apiKeyName: "Production app",
  taskId: "task-video-22",
};

const topupEntry: BillingLedgerEntry = {
  id: "21",
  eventId: null,
  type: "topup",
  createdAt: 1_788_070_000,
  content: "Account recharge completed",
  sourceIp: "203.0.113.24",
  amountUsd: null,
  model: null,
  apiKeyName: null,
  taskId: null,
};

beforeEach(() => {
  getBillingLedgerPage.mockReset();
  copyEventId.mockReset();
  copyEventId.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: copyEventId },
  });
});

describe("BillingLedgerPanel boundaries", () => {
  test("keeps a service failure distinct from an empty balance history and retries in place", async () => {
    getBillingLedgerPage
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(ledgerPage([refundEntry]));

    renderLedgerPanel();

    expect(await screen.findByText("Unable to load balance activity")).toBeVisible();
    expect(screen.queryByText("No balance activity yet")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    const eventAction = await screen.findByRole("button", {
      name: `View balance event ${refundEntry.id}`,
    });
    const row = eventAction.closest("tr");
    expect(row).not.toBeNull();
    expect(within(row!).getByText(/0\.03/)).toBeVisible();
    expect(getBillingLedgerPage).toHaveBeenCalledTimes(2);
  });

  test("shows unavailable structured amounts without parsing the recorded description", async () => {
    getBillingLedgerPage.mockResolvedValue(ledgerPage([topupEntry]));

    const onSearchChange = vi.fn();
    const list = renderLedgerPanel(true, { tab: "ledger" }, onSearchChange);
    const eventAction = await screen.findByRole("button", {
      name: `View balance event ${topupEntry.id}`,
    });
    const row = eventAction.closest("tr");
    expect(row).not.toBeNull();
    expect(within(row!).getByText("—")).toHaveAttribute(
      "title",
      "This event does not include a structured amount.",
    );
    list.unmount();

    renderLedgerPanel(true, { ledgerDetail: topupEntry.id, tab: "ledger" }, onSearchChange);

    const details = await screen.findByRole("dialog");
    expect(within(details).getByText("Balance event details")).toBeVisible();
    expect(within(details).getByText("Not recorded in structured data")).toBeVisible();
    expect(within(details).getByText("203.0.113.24")).toBeVisible();
    fireEvent.click(within(details).getByRole("button", { name: "Copy event ID" }));
    expect(copyEventId).toHaveBeenCalledWith(topupEntry.id);
    fireEvent.click(within(details).getByRole("button", { name: "Close" }));
    expect(onSearchChange).toHaveBeenCalledWith({ ledgerDetail: undefined });
  });

  test("writes the selected balance event into URL search state", async () => {
    getBillingLedgerPage.mockResolvedValue(ledgerPage([refundEntry]));
    const onSearchChange = vi.fn();

    renderLedgerPanel(true, { tab: "ledger" }, onSearchChange);
    fireEvent.click(
      await screen.findByRole("button", { name: `View balance event ${refundEntry.id}` }),
    );

    expect(onSearchChange).toHaveBeenCalledWith({ ledgerDetail: refundEntry.id });
  });

  test("does not substitute another balance event when a shared event is unavailable", async () => {
    getBillingLedgerPage.mockResolvedValue(ledgerPage([refundEntry]));
    const onSearchChange = vi.fn();

    renderLedgerPanel(true, { ledgerDetail: "event-missing", tab: "ledger" }, onSearchChange);

    expect(await screen.findByText("Balance event details unavailable")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onSearchChange).toHaveBeenCalledWith({ ledgerDetail: undefined });
  });

  test("preserves balance activity columns while the page is loading", () => {
    getBillingLedgerPage.mockReturnValue(new Promise(() => undefined));

    renderLedgerPanel();

    expect(screen.getByRole("columnheader", { name: "Event ID" })).toBeVisible();
    expect(screen.getAllByRole("row", { name: "Loading" })).toHaveLength(3);
    expect(screen.queryByText("No balance activity yet")).not.toBeInTheDocument();
  });

  test("does not request the ledger before its tab is active", () => {
    renderLedgerPanel(false);

    expect(getBillingLedgerPage).not.toHaveBeenCalled();
  });
});

function renderLedgerPanel(
  active = true,
  search: BillingSearch = { tab: "ledger" },
  onSearchChange: (patch: SearchPatch<BillingSearch>) => void = vi.fn(),
) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BillingLedgerPanel
        active={active}
        onSearchChange={onSearchChange}
        range={range}
        search={search}
      />
    </QueryClientProvider>,
  );
}

function ledgerPage(items: BillingLedgerEntry[]) {
  return { items, page: 1, pageSize: 20, total: items.length };
}
