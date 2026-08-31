import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { BillingData } from "@/data/contracts";
import { BillingPage } from "../pages/billing-page";

const { getBilling, getBillingTransactionsPage, redeemCode } = vi.hoisted(() => ({
  getBilling: vi.fn(),
  getBillingTransactionsPage: vi.fn(),
  redeemCode: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children?: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/date-range-picker", () => ({
  DateRangePicker: () => <button type="button">Date range</button>,
}));

vi.mock("@/data/repository", () => ({
  repository: {
    getBilling,
    getBillingTransactionsPage,
    mode: "live",
    redeemCode,
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string) => key,
  }),
}));

beforeEach(() => {
  getBilling.mockReset();
  getBillingTransactionsPage.mockReset();
  redeemCode.mockReset();
  getBillingTransactionsPage.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
});

describe("BillingPage plan states", () => {
  test("shows an actionable empty state when no subscription plans are configured", async () => {
    getBilling.mockResolvedValue(billingFixture());

    renderBillingPage();

    const title = await screen.findByText("No subscription plans available");
    expect(title).toBeVisible();
    expect(
      screen.getByText(
        "No plans are currently configured for your account group. You can continue with pay-as-you-go recharge.",
      ),
    ).toBeVisible();
    const emptyState = title.closest<HTMLElement>('[data-slot="empty"]');
    expect(emptyState).not.toBeNull();
    expect(within(emptyState!).getByRole("button", { name: "Account recharge" })).toHaveAttribute(
      "href",
      "/recharge",
    );
  });

  test("keeps loading failures distinct from an empty plan catalog and retries", async () => {
    getBilling.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(billingFixture());

    renderBillingPage();

    expect(await screen.findByText("Unable to load subscription plans")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(getBilling).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("No subscription plans available")).toBeVisible();
  });

  test("normalizes redemption codes and keeps the dialog locked while submitting", async () => {
    const billing = billingFixture();
    let resolveRedemption!: (value: BillingData) => void;
    getBilling.mockResolvedValue(billing);
    redeemCode.mockReturnValue(
      new Promise((resolve) => {
        resolveRedemption = resolve;
      }),
    );
    renderBillingPage();

    fireEvent.click(screen.getByRole("button", { name: "Redeem code" }));
    const dialog = await screen.findByRole("dialog", { name: "Redeem a code" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Redemption code" }), {
      target: { value: "  MERCHANT-CREDIT  " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Redeem" }));

    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Redeem" })).toBeDisabled(),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(dialog).toBeVisible();
    expect(redeemCode.mock.calls[0]?.[0]).toBe("MERCHANT-CREDIT");

    await act(async () => resolveRedemption(billing));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Redeem a code" })).not.toBeInTheDocument(),
    );
  });
});

function renderBillingPage() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BillingPage search={{ tab: "plans" }} />
    </QueryClientProvider>,
  );
}

function billingFixture(): BillingData {
  return {
    balance: 0,
    currency: "USD",
    monthSpend: 0,
    pendingAmount: 0,
    plans: [],
    transactions: [],
  };
}
