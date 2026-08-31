import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { BillingData, BillingTransaction, DateRangeValue } from "@/data/contracts";
import { BillingPage } from "../pages/billing-page";

const { copyOrderId, getBilling, getBillingTransactionsPage } = vi.hoisted(() => ({
  copyOrderId: vi.fn(),
  getBilling: vi.fn(),
  getBillingTransactionsPage: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children?: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/date-range-picker", () => ({
  DateRangePicker: (props: { onChange(value: DateRangeValue): void }) => (
    <button
      onClick={() => props.onChange({ from: "2026-08-01", preset: "custom", to: "2026-08-31" })}
      type="button"
    >
      Date range
    </button>
  ),
}));

vi.mock("@/data/repository", () => ({
  repository: {
    getBilling,
    getBillingTransactionsPage,
    mode: "live",
  },
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

const transaction: BillingTransaction = {
  amount: -29,
  createdAt: 1_788_070_400,
  description: "Developer Pro subscription",
  id: "subscription-order-202608300001",
  status: "completed",
  type: "subscription",
};

beforeEach(() => {
  copyOrderId.mockReset();
  copyOrderId.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: copyOrderId },
  });
  getBilling.mockReset();
  getBillingTransactionsPage.mockReset();
  getBilling.mockResolvedValue(billingFixture());
});

describe("BillingPage transaction boundaries", () => {
  test("keeps a transaction failure distinct from zero spend and an empty history", async () => {
    getBillingTransactionsPage
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(transactionPage());

    renderBillingPage();

    expect(await screen.findByText("Unable to load payment orders")).toBeVisible();
    expect(screen.queryByText("No transactions yet")).not.toBeInTheDocument();
    const spendCard = screen
      .getByText("Charges on this page")
      .closest<HTMLElement>('[data-slot="card"]');
    expect(spendCard).not.toBeNull();
    expect(within(spendCard!).getByText("—")).toBeVisible();
    expect(within(spendCard!).getByText("Payment order data unavailable")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole("button", { name: `View payment order ${transaction.id}` }),
    ).toBeVisible();
    expect(within(spendCard!).getByText("$29.00")).toBeVisible();
    expect(getBillingTransactionsPage).toHaveBeenCalledTimes(2);
  });

  test("opens the complete recorded transaction from its order identifier", async () => {
    getBillingTransactionsPage.mockResolvedValue(transactionPage());

    renderBillingPage();
    fireEvent.click(
      await screen.findByRole("button", { name: `View payment order ${transaction.id}` }),
    );

    const details = await screen.findByRole("dialog");
    expect(within(details).getByText("Payment order details")).toBeVisible();
    expect(within(details).getByText(transaction.id)).toBeVisible();
    expect(within(details).getByText("Developer Pro subscription")).toBeVisible();
    expect(within(details).getByText("Subscription")).toBeVisible();
    expect(within(details).getAllByText("Completed")).toHaveLength(2);
    expect(within(details).getByText("-$29.00")).toBeVisible();
    fireEvent.click(within(details).getByRole("button", { name: "Copy order ID" }));
    expect(copyOrderId).toHaveBeenCalledWith(transaction.id);
  });

  test("restores a shared payment order and clears its URL selection when closed", async () => {
    getBillingTransactionsPage.mockResolvedValue(transactionPage());
    const onSearchChange = vi.fn();

    renderBillingPage(
      <BillingPage search={{ detail: transaction.id }} onSearchChange={onSearchChange} />,
    );

    const details = await screen.findByRole("dialog");
    expect(within(details).getByText(transaction.id)).toBeVisible();
    fireEvent.click(within(details).getByRole("button", { name: "Close" }));
    expect(onSearchChange).toHaveBeenCalledWith({ detail: undefined });
  });

  test("does not substitute another payment order when a shared order is unavailable", async () => {
    getBillingTransactionsPage.mockResolvedValue(transactionPage());
    const onSearchChange = vi.fn();

    renderBillingPage(
      <BillingPage search={{ detail: "order-missing" }} onSearchChange={onSearchChange} />,
    );

    expect(await screen.findByText("Payment order details unavailable")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onSearchChange).toHaveBeenCalledWith({ detail: undefined });
  });

  test("preserves payment order columns while the page is loading", async () => {
    getBillingTransactionsPage.mockReturnValue(new Promise(() => undefined));

    renderBillingPage();

    expect(screen.getByRole("columnheader", { name: "Order ID" })).toBeVisible();
    expect(screen.getAllByRole("row", { name: "Loading" })).toHaveLength(3);
    expect(screen.queryByText("No transactions yet")).not.toBeInTheDocument();
  });

  test("resets payment and ledger pagination when the shared date range changes", async () => {
    getBillingTransactionsPage.mockResolvedValue(transactionPage());
    const onSearchChange = vi.fn();

    renderBillingPage(
      <BillingPage
        onSearchChange={onSearchChange}
        search={{ detail: transaction.id, ledgerDetail: "event-42", ledgerPage: 3, page: 2 }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Date range" }));

    expect(onSearchChange).toHaveBeenCalledWith({
      detail: undefined,
      from: "2026-08-01",
      ledgerDetail: undefined,
      ledgerPage: undefined,
      page: undefined,
      range: "custom",
      to: "2026-08-31",
    });
  });

  test("does not assume a transaction currency when the billing summary is unavailable", async () => {
    getBilling.mockRejectedValue(new Error("billing unavailable"));
    getBillingTransactionsPage.mockResolvedValue(transactionPage());

    renderBillingPage();

    expect(await screen.findByText("Unable to load billing summary")).toBeVisible();
    const rowAction = await screen.findByRole("button", {
      name: `View payment order ${transaction.id}`,
    });
    const row = rowAction.closest("tr");
    expect(row).not.toBeNull();
    expect(within(row!).getByText("—")).toBeVisible();
    expect(within(row!).queryByText("-$29.00")).not.toBeInTheDocument();
  });
});

function renderBillingPage(page: ReactNode = <BillingPage />) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{page}</QueryClientProvider>);
}

function billingFixture(): BillingData {
  return {
    balance: 100,
    currency: "USD",
    monthSpend: null,
    pendingAmount: null,
    plans: [],
    transactions: [],
  };
}

function transactionPage() {
  return { items: [transaction], page: 1, pageSize: 20, total: 1 };
}
