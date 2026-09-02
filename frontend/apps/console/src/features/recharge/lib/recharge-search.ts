export type RechargePaymentStatus = "cancelled" | "pending" | "success";

const rechargePaymentStatuses = new Set<RechargePaymentStatus>(["cancelled", "pending", "success"]);

export function parseRechargeSearch(search: Record<string, unknown>): {
  payment?: RechargePaymentStatus;
} {
  const payment = search.payment;
  if (payment === undefined) return {};
  if (
    typeof payment !== "string" ||
    !rechargePaymentStatuses.has(payment as RechargePaymentStatus)
  ) {
    throw new TypeError("Invalid recharge payment status.");
  }
  return { payment: payment as RechargePaymentStatus };
}
