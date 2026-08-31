import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { BillingData, RechargeConfiguration } from "@/data/contracts";
import { RechargePage } from "../pages/recharge-page";

const {
  createRechargeCheckout,
  getBilling,
  getRechargeConfiguration,
  getRechargeQuote,
  redeemCode,
} = vi.hoisted(() => ({
  createRechargeCheckout: vi.fn(),
  getBilling: vi.fn(),
  getRechargeConfiguration: vi.fn(),
  getRechargeQuote: vi.fn(),
  redeemCode: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children?: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/data/repository", () => ({
  repository: {
    mode: "demo",
    createRechargeCheckout,
    getBilling,
    getRechargeConfiguration,
    getRechargeQuote,
    redeemCode,
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

const configuration: RechargeConfiguration = {
  amountOptions: [10, 100, 250],
  complianceConfirmed: true,
  customCurrencySymbol: "$",
  discounts: { "100": 0.95 },
  displayType: "USD",
  externalTopupUrl: null,
  onlineEnabled: true,
  paymentCurrency: "USD",
  paymentMethods: [
    { id: "stripe-0", name: "Stripe", type: "stripe", minAmount: 10 },
    { id: "alipay-1", name: "Alipay", type: "alipay", minAmount: 10 },
  ],
  products: [],
  quotaPerUnit: 1,
  redemptionEnabled: true,
  usdExchangeRate: 1,
};

const billing: BillingData = {
  balance: 128.4,
  currency: "USD",
  monthSpend: 10,
  pendingAmount: 0,
  plans: [],
  transactions: [],
};

beforeEach(() => {
  getBilling.mockReset();
  getRechargeConfiguration.mockReset();
  getRechargeQuote.mockReset();
  createRechargeCheckout.mockReset();
  redeemCode.mockReset();
  getBilling.mockResolvedValue(billing);
  getRechargeConfiguration.mockResolvedValue(configuration);
  getRechargeQuote.mockImplementation(({ amount }: { amount: number }) =>
    Promise.resolve({ amount: amount === 100 ? 95 : amount, currency: "USD" }),
  );
});

describe("RechargePage", () => {
  test("shows a consumer recharge workflow with balance, presets, payment methods, and quote", async () => {
    renderRecharge();

    expect(await screen.findByText("Current balance")).toBeInTheDocument();
    expect(await screen.findByText("$128.40")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Stripe/ })).toBePressed();
    expect(await screen.findByText("$10.00", { selector: "dd" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /\$100\.00/ }));

    await waitFor(() =>
      expect(getRechargeQuote).toHaveBeenLastCalledWith(
        expect.objectContaining({ amount: 100, currency: "USD" }),
      ),
    );
    expect(await screen.findByText("$95.00", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to payment" })).toBeEnabled();
  });

  test("shows the provider confirmation status after returning from checkout", async () => {
    renderRecharge("success");

    expect(await screen.findByText("Payment submitted")).toBeInTheDocument();
    expect(
      screen.getByText("The balance will update after the payment provider confirms the order."),
    ).toBeInTheDocument();
  });

  test("debounces custom amount quotes and only requests the final valid amount", async () => {
    renderRecharge();

    const amountInput = await screen.findByRole("textbox", { name: "Custom amount" });
    await waitFor(() => expect(getRechargeQuote).toHaveBeenCalled());
    getRechargeQuote.mockClear();

    fireEvent.change(amountInput, { target: { value: "20" } });
    fireEvent.change(amountInput, { target: { value: "200" } });
    fireEvent.change(amountInput, { target: { value: "2000" } });

    await waitFor(
      () => {
        expect(getRechargeQuote).toHaveBeenCalledTimes(1);
        expect(getRechargeQuote).toHaveBeenLastCalledWith(
          expect.objectContaining({ amount: 2000, currency: "USD" }),
        );
      },
      { timeout: 1_000 },
    );
  });

  test("marks a recharge amount below the selected method minimum", async () => {
    renderRecharge();

    const amountInput = await screen.findByRole("textbox", { name: "Custom amount" });
    fireEvent.change(amountInput, { target: { value: "5" } });

    expect(amountInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter a whole-number amount of at least $10.00.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue to payment" })).toBeDisabled();
  });

  test("shows a retryable error when the payable quote cannot be loaded", async () => {
    getRechargeQuote
      .mockRejectedValueOnce(new Error("quote unavailable"))
      .mockResolvedValueOnce({ amount: 10, currency: "USD" });
    renderRecharge();

    expect(await screen.findByText("Unable to calculate payment amount")).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue to payment" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("$10.00", { selector: "dd" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue to payment" })).toBeEnabled();
  });

  test("allows the confirmation dialog to be cancelled before creating an order", async () => {
    renderRecharge();

    const continueButton = await screen.findByRole("button", { name: "Continue to payment" });
    await waitFor(() => expect(continueButton).toBeEnabled());
    fireEvent.click(continueButton);
    expect(await screen.findByRole("dialog", { name: "Confirm recharge" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Confirm recharge" })).not.toBeInTheDocument(),
    );
    expect(createRechargeCheckout).not.toHaveBeenCalled();
  });
});

function renderRecharge(paymentStatus?: "cancelled" | "pending" | "success") {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RechargePage paymentStatus={paymentStatus} />
    </QueryClientProvider>,
  );
}
