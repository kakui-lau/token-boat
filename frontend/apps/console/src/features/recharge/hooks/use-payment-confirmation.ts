import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { PaymentConfirmationStatus } from "@/data/contracts";
import { repository } from "@/data/repository";
import {
  clearPendingPayment,
  readPendingPayment,
  type PendingPayment,
} from "@/lib/payment-checkout";
import { invalidateBillingQueries } from "@/features/billing/lib/invalidate-billing-queries";

export type PaymentReturnState =
  | "completed"
  | "failed"
  | "idle"
  | "checking"
  | "submitted"
  | "timeout";

type ConfirmationFetcher = typeof repository.getPaymentConfirmation;
type Wait = (delayMs: number, signal?: AbortSignal) => Promise<void>;

const pollAttempts = 10;
const pollIntervalMs = 1_500;

const wait: Wait = (delayMs, signal) =>
  new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const timeout = window.setTimeout(finish, delayMs);
    signal?.addEventListener("abort", finish, { once: true });
  });

export async function pollPaymentConfirmation(
  pending: PendingPayment,
  fetchConfirmation: ConfirmationFetcher = repository.getPaymentConfirmation,
  waitForNextAttempt: Wait = wait,
  signal?: AbortSignal,
): Promise<Exclude<PaymentConfirmationStatus, "pending"> | "timeout"> {
  for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
    if (signal?.aborted) return "timeout";
    try {
      const status = await fetchConfirmation(pending, signal);
      if (status !== "pending") return status;
    } catch {
      if (signal?.aborted) return "timeout";
      // A temporary API failure should not turn a provider return into a failed payment.
    }
    if (attempt < pollAttempts - 1) await waitForNextAttempt(pollIntervalMs, signal);
  }
  return "timeout";
}

export function usePaymentConfirmation(enabled: boolean) {
  const queryClient = useQueryClient();
  const [pending] = useState(readPendingPayment);
  const [retryCount, setRetryCount] = useState(0);
  const [state, setState] = useState<PaymentReturnState>(
    enabled ? (pending ? "checking" : "submitted") : "idle",
  );

  useEffect(() => {
    if (!enabled) {
      setState("idle");
      return;
    }
    if (!pending) {
      setState("submitted");
      return;
    }
    const controller = new AbortController();
    setState("checking");
    void pollPaymentConfirmation(
      pending,
      repository.getPaymentConfirmation,
      wait,
      controller.signal,
    ).then((result) => {
      if (controller.signal.aborted) return;
      setState(result);
      if (result === "completed") {
        void invalidateBillingQueries(queryClient);
      }
      if (result !== "timeout") clearPendingPayment();
      window.history.replaceState({}, "", window.location.pathname);
    });
    return () => {
      controller.abort();
    };
  }, [enabled, pending, queryClient, retryCount]);

  return {
    retry: () => setRetryCount((count) => count + 1),
    state,
  };
}
