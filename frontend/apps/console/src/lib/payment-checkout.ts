import type { PaymentConfirmationInput, RechargeCheckout } from "@/data/contracts";

const pendingPaymentKey = "token-boat.console.pending-payment.v1";
const pendingPaymentLifetimeMs = 2 * 60 * 60 * 1000;

export type PendingPayment = PaymentConfirmationInput & {
  startedAt: number;
};

export function savePendingPayment(input: PaymentConfirmationInput): PendingPayment {
  const pending = { ...input, startedAt: Date.now() };
  try {
    window.sessionStorage.setItem(pendingPaymentKey, JSON.stringify(pending));
  } catch {
    // Payment can continue when storage is unavailable; return confirmation will be generic.
  }
  return pending;
}

export function readPendingPayment(): PendingPayment | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(pendingPaymentKey) ?? "null") as unknown;
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (record.kind !== "topup" && record.kind !== "subscription") return null;
    if (
      typeof record.startedAt !== "number" ||
      Date.now() - record.startedAt > pendingPaymentLifetimeMs
    ) {
      clearPendingPayment();
      return null;
    }
    return {
      kind: record.kind,
      orderId: typeof record.orderId === "string" ? record.orderId : undefined,
      planId: typeof record.planId === "number" ? record.planId : undefined,
      startedAt: record.startedAt,
    };
  } catch {
    return null;
  }
}

export function clearPendingPayment() {
  try {
    window.sessionStorage.removeItem(pendingPaymentKey);
  } catch {
    // Storage may be disabled by the browser.
  }
}

export function continueToCheckout(
  checkout: Exclude<RechargeCheckout, { kind: "demo" }>,
  pending: PaymentConfirmationInput,
) {
  savePendingPayment({ ...pending, orderId: checkout.orderId ?? pending.orderId });
  if (checkout.kind === "redirect") {
    window.location.assign(checkout.url);
    return;
  }
  const form = document.createElement("form");
  form.action = checkout.url;
  form.method = "POST";
  for (const [name, value] of Object.entries(checkout.fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
  form.remove();
}
