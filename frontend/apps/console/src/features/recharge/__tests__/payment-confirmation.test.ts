import { createElement, type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { savePendingPayment } from "@/lib/payment-checkout";
import { pollPaymentConfirmation, usePaymentConfirmation } from "../hooks/use-payment-confirmation";

const { getPaymentConfirmation } = vi.hoisted(() => ({ getPaymentConfirmation: vi.fn() }));

vi.mock("@/data/repository", () => ({
  repository: { getPaymentConfirmation },
}));

const pendingPayment = {
  kind: "topup" as const,
  orderId: "ref-payment",
  startedAt: Date.now(),
};

beforeEach(() => {
  getPaymentConfirmation.mockReset();
  window.sessionStorage.clear();
});

describe("payment return confirmation", () => {
  test("waits for a pending provider callback and returns the completed state", async () => {
    const fetchConfirmation = vi
      .fn()
      .mockResolvedValueOnce("pending")
      .mockResolvedValueOnce("pending")
      .mockResolvedValueOnce("completed");
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(pollPaymentConfirmation(pendingPayment, fetchConfirmation, wait)).resolves.toBe(
      "completed",
    );
    expect(fetchConfirmation).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  test("keeps polling after a temporary request failure", async () => {
    const fetchConfirmation = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary outage"))
      .mockResolvedValueOnce("failed");

    await expect(
      pollPaymentConfirmation(pendingPayment, fetchConfirmation, () => Promise.resolve()),
    ).resolves.toBe("failed");
  });

  test("stops polling immediately when the owning page is disposed", async () => {
    const controller = new AbortController();
    const fetchConfirmation = vi.fn().mockResolvedValue("pending");
    const wait = vi.fn(async () => {
      controller.abort();
    });

    await expect(
      pollPaymentConfirmation(pendingPayment, fetchConfirmation, wait, controller.signal),
    ).resolves.toBe("timeout");
    expect(fetchConfirmation).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledTimes(1);
  });

  test("restores a pending order when confirmation becomes enabled after mount", async () => {
    savePendingPayment({ kind: "topup", orderId: "order-late-return" });
    getPaymentConfirmation.mockResolvedValue("completed");
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    const view = renderHook(({ enabled }) => usePaymentConfirmation(enabled), {
      initialProps: { enabled: false },
      wrapper: (props: PropsWithChildren) =>
        createElement(QueryClientProvider, { client: queryClient }, props.children),
    });

    expect(view.result.current.state).toBe("idle");
    view.rerender({ enabled: true });

    await waitFor(() => expect(view.result.current.state).toBe("completed"));
    expect(getPaymentConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "topup", orderId: "order-late-return" }),
      expect.any(AbortSignal),
    );
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ["billing"],
      ["billing-ledger"],
      ["billing-transactions"],
      ["onboarding"],
      ["overview"],
    ]);
  });
});
