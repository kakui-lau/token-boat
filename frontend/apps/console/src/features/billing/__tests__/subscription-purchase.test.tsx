import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { SubscriptionPlan } from "@/data/contracts";
import { SubscriptionPurchaseDialog } from "../components/subscription-purchase-dialog";

const { purchaseSubscription } = vi.hoisted(() => ({ purchaseSubscription: vi.fn() }));

vi.mock("@/data/repository", () => ({
  repository: { purchaseSubscription },
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

const plan: SubscriptionPlan = {
  id: 4,
  name: "Business",
  price: 49,
  currency: "USD",
  interval: "month",
  durationUnit: "month",
  durationValue: 1,
  quotaUsd: 400,
  unlimitedQuota: false,
  quotaResetPeriod: "monthly",
  features: ["Priority capacity"],
  current: false,
  purchaseCount: 0,
  purchaseLimit: 3,
  paymentMethods: [
    { id: "balance", name: "Account balance", type: "balance" },
    { id: "stripe", name: "Stripe", type: "stripe" },
  ],
};

beforeEach(() => {
  purchaseSubscription.mockReset();
  purchaseSubscription.mockResolvedValue({ kind: "completed" });
});

describe("subscription purchase", () => {
  test("confirms a plan purchase with account balance", async () => {
    const onOpenChange = vi.fn();
    renderDialog(100, onOpenChange);

    expect(screen.getByRole("button", { name: /Account balance/ })).toBePressed();
    fireEvent.click(screen.getByRole("button", { name: "Confirm purchase" }));

    await waitFor(() => expect(purchaseSubscription).toHaveBeenCalled());
    expect(purchaseSubscription.mock.calls[0]?.[0]).toEqual({
      planId: 4,
      method: { id: "balance", name: "Account balance", type: "balance" },
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("prevents balance purchase when the account balance is insufficient", () => {
    renderDialog(10, vi.fn());

    expect(screen.getByText("Insufficient account balance")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm purchase" })).toBeDisabled();
  });

  test("purchases once on rapid confirmation and unlocks after failure", async () => {
    purchaseSubscription
      .mockRejectedValueOnce(new Error("purchase unavailable"))
      .mockResolvedValueOnce({ kind: "completed" });
    const onOpenChange = vi.fn();
    renderDialog(100, onOpenChange);
    const purchaseButton = screen.getByRole("button", { name: "Confirm purchase" });

    act(() => {
      purchaseButton.click();
      purchaseButton.click();
    });
    await waitFor(() => expect(purchaseSubscription).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(purchaseButton).toBeEnabled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    fireEvent.click(purchaseButton);
    await waitFor(() => expect(purchaseSubscription).toHaveBeenCalledTimes(2));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

function renderDialog(balance: number, onOpenChange: (open: boolean) => void) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SubscriptionPurchaseDialog
        balance={balance}
        locale="en"
        onOpenChange={onOpenChange}
        open
        plan={plan}
      />
    </QueryClientProvider>,
  );
}
