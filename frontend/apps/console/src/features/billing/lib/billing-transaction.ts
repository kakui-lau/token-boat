import type { BillingTransaction } from "@/data/contracts";

export function billingTransactionTypeLabel(type: BillingTransaction["type"]): string {
  if (type === "topup") return "Top-up";
  if (type === "redeem") return "Redemption";
  if (type === "subscription") return "Subscription";
  return "Usage";
}

export function billingTransactionStatusLabel(status: BillingTransaction["status"]): string {
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  return "Pending";
}

export function billingTransactionStatusVariant(
  status: BillingTransaction["status"],
): "destructive" | "outline" | "secondary" {
  if (status === "completed") return "secondary";
  if (status === "failed") return "destructive";
  return "outline";
}
